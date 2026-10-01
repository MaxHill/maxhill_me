/// TODO: is i32 the correct type for version and contexts
///
/// TODO: Derive fixed-buffer byte capacities from the hash-map entry bounds
/// and check the relationship at comptime where Zig's hash-map layout permits.
const std = @import("std");
const assert = std.debug.assert;

// TODO: object_fields_max is not a good name, it can also not be
// shared between ORMapRowFields and SetRowFields
const object_fields_max = 200;
const user_row_fields_max = object_fields_max + 1;
const context_max = 200;

pub const JsonBytes = []const u8;

pub const ClientId = [16]u8;

pub fn client_id_from_bytes(bytes: []const u8) !ClientId {
    if (bytes.len != @sizeOf(ClientId)) return error.InvalidClientIdLength;

    var id: ClientId = undefined;
    @memcpy(&id, bytes);
    return id;
}

pub const Dot = struct {
    client_id: ClientId,
    version: i32,

    fn assert_valid(dot: Dot) void {
        assert(!std.mem.allEqual(u8, &dot.client_id, 0));
        assert(dot.version >= 0);
    }

    fn order(self: @This(), target: Dot) std.math.Order {
        self.assert_valid();
        target.assert_valid();

        const version_order = std.math.order(
            self.version,
            target.version,
        );
        return switch (version_order) {
            .eq => std.mem.order(
                u8,
                &self.client_id,
                &target.client_id,
            ),
            else => version_order,
        };
    }
};

pub const SetRowFields = struct {
    keys: [object_fields_max][]const u8 = undefined,
    values: [object_fields_max]JsonBytes = undefined,
    count: usize = 0,

    pub fn get(self: *const @This(), key: []const u8) ?JsonBytes {
        assert(key.len > 0);
        for (
            self.keys[0..self.count],
            self.values[0..self.count],
        ) |entry_key, value| {
            if (std.mem.eql(u8, entry_key, key)) return value;
        }
        return null;
    }

    pub fn contains(self: *const @This(), key: []const u8) bool {
        assert(key.len > 0);
        return self.get(key) != null;
    }

    pub fn put(self: *@This(), key: []const u8, value: JsonBytes) void {
        assert(key.len > 0);
        for (
            self.keys[0..self.count],
            self.values[0..self.count],
        ) |entry_key, *entry_value| {
            if (std.mem.eql(u8, entry_key, key)) {
                entry_value.* = value;
                return;
            }
        }

        assert(self.count < object_fields_max);
        self.keys[self.count] = key;
        self.values[self.count] = value;
        self.count += 1;
    }
};

pub const Context = struct {
    ids: [context_max]ClientId = undefined,
    versions: [context_max]i32 = undefined,
    count: usize = 0,

    pub fn get(self: *const @This(), id: ClientId) ?i32 {
        for (
            self.ids[0..self.count],
            self.versions[0..self.count],
        ) |x, v| {
            if (std.mem.eql(u8, &x, &id)) return v;
        }
        return null;
    }

    pub fn contains(self: *const @This(), id: ClientId) bool {
        return self.get(id) != null;
    }

    pub fn put_max(self: *@This(), id: ClientId, version: i32) void {
        assert(version >= 0);
        for (
            self.ids[0..self.count],
            self.versions[0..self.count],
        ) |entry_id, *entry_version| {
            if (std.mem.eql(u8, &entry_id, &id)) {
                entry_version.* = @max(entry_version.*, version);
                return;
            }
        }

        assert(self.count < context_max);
        self.ids[self.count] = id;
        self.versions[self.count] = version;
        self.count += 1;
    }
};

pub const ValidKey = []const u8;
pub const CRDTOperation = union(enum) {
    set: struct {
        table: []const u8,
        row_key: []const u8,
        field: ?[]const u8,
        value: JsonBytes,
        dot: Dot,
    },
    set_row: struct {
        table: []const u8,
        row_key: []const u8,
        value: SetRowFields,
        dot: Dot,
    },
    remove: struct {
        table: []const u8,
        row_key: []const u8,
        tombstone: Tombstone,
    },

    fn assert_valid(operation: CRDTOperation) void {
        switch (operation) {
            .set => |set| {
                assert(set.table.len > 0);
                assert(set.row_key.len > 0);
                assert(set.field != null);
                assert(set.field.?.len > 0);
                set.dot.assert_valid();
            },
            .set_row => |set_row| {
                assert(set_row.table.len > 0);
                assert(set_row.row_key.len > 0);
                set_row.dot.assert_valid();
            },
            .remove => |remove| {
                assert(remove.table.len > 0);
                assert(remove.row_key.len > 0);
                remove.tombstone.assert_valid();
            },
        }
    }
};

pub const LWWField = struct {
    value: JsonBytes,
    dot: Dot,
};

pub const Tombstone = struct {
    dot: ?Dot,
    context: Context = .{},

    fn covers(t: *const Tombstone, dot: Dot) bool {
        if (t.dot == null) return false;
        const seen = t.context.get(dot.client_id) orelse return false;
        return dot.version <= seen;
    }

    fn merge(self: *@This(), dot: Dot, context: *const Context) void {
        if (self.dot == null or dot.order(self.dot.?) == .gt) self.dot = dot;
        for (
            context.ids[0..context.count],
            context.versions[0..context.count],
        ) |id, v|
            self.context.put_max(id, v);
    }

    fn merge_tombstone(self: *@This(), tombstone: Tombstone) void {
        tombstone.assert_valid();
        if (tombstone.dot) |dot| {
            self.merge(dot, &tombstone.context);
        }
    }

    pub fn active(tombstone: Tombstone) bool {
        return tombstone.dot != null;
    }

    pub fn assert_valid(tombstone: Tombstone) void {
        if (tombstone.dot) |dot| {
            dot.assert_valid();
            assert_context_valid(tombstone.context);
        } else {
            assert(tombstone.context.count == 0);
        }
    }
};

// This probably replaces or should be the LWWField type
pub const ORMapRowFields = struct {
    keys: [object_fields_max][]const u8 = undefined,
    values: [object_fields_max]JsonBytes = undefined,
    dots: [object_fields_max]Dot = undefined,
    count: usize = 0,

    pub fn get_index(self: *const @This(), key: []const u8) ?usize {
        assert(key.len > 0);
        assert(self.count <= object_fields_max);
        for (
            self.keys[0..self.count],
            0..self.count,
        ) |entry_key, index| {
            if (std.mem.eql(u8, entry_key, key)) return index;
        }
        return null;
    }

    pub fn get(self: *const @This(), key: []const u8) ?LWWField {
        assert(key.len > 0);
        assert(self.count <= object_fields_max);
        if (self.get_index(key)) |index| {
            return LWWField{
                .value = self.values[index],
                .dot = self.dots[index],
            };
        }
        return null;
    }

    pub fn contains(self: *const @This(), key: []const u8) bool {
        assert(key.len > 0);
        assert(self.count <= object_fields_max);
        return self.get_index(key) != null;
    }

    pub fn put(
        self: *@This(),
        key: []const u8,
        value: JsonBytes,
        dot: Dot,
    ) void {
        assert(key.len > 0);
        assert(self.count <= object_fields_max);
        dot.assert_valid();

        for (
            self.keys[0..self.count],
            self.values[0..self.count],
            self.dots[0..self.count],
        ) |entry_key, *entry_value, *entry_dot| {
            if (std.mem.eql(u8, entry_key, key)) {
                entry_value.* = value;
                entry_dot.* = dot;
                return;
            }
        }

        assert(self.count < object_fields_max);
        self.keys[self.count] = key;
        self.values[self.count] = value;
        self.dots[self.count] = dot;
        self.count += 1;
    }

    pub fn remove(self: *@This(), key: []const u8) bool {
        assert(key.len > 0);
        assert(self.count <= object_fields_max);

        const index = self.get_index(key) orelse return false;
        assert(index < self.count);

        var shift_index = index;
        while (shift_index + 1 < self.count) : (shift_index += 1) {
            self.keys[shift_index] = self.keys[shift_index + 1];
            self.values[shift_index] = self.values[shift_index + 1];
            self.dots[shift_index] = self.dots[shift_index + 1];
        }

        self.count -= 1;
        return true;
    }

    pub fn clear(self: *@This()) void {
        assert(self.count <= object_fields_max);
        self.count = 0;
    }
};

test "ORMapRowFields put get remove and clear" {
    var fields = ORMapRowFields{};
    assert(fields.count == 0);

    const client_id = test_client_id("client_1");
    const first_dot = Dot{
        .client_id = client_id,
        .version = 1,
    };
    const second_dot = Dot{
        .client_id = client_id,
        .version = 2,
    };
    const third_dot = Dot{
        .client_id = client_id,
        .version = 3,
    };

    fields.put("name", "\"max\"", first_dot);
    fields.put("age", "31", second_dot);
    assert(fields.count == 2);

    try std.testing.expect(fields.contains("name"));
    try std.testing.expect(fields.contains("age"));
    try std.testing.expectEqualStrings(
        "\"max\"",
        fields.get("name").?.value,
    );
    try std.testing.expectEqualStrings(
        "31",
        fields.get("age").?.value,
    );

    fields.put("name", "\"maxwell\"", third_dot);
    assert(fields.count == 2);
    try std.testing.expectEqualStrings(
        "\"maxwell\"",
        fields.get("name").?.value,
    );
    try std.testing.expectEqual(
        @as(i32, 3),
        fields.get("name").?.dot.version,
    );

    try std.testing.expect(fields.remove("name"));
    assert(fields.count == 1);
    try std.testing.expect(!fields.contains("name"));
    try std.testing.expect(fields.contains("age"));

    try std.testing.expect(fields.remove("age"));
    try std.testing.expect(!fields.remove("missing"));
    fields.clear();
    try std.testing.expectEqual(@as(usize, 0), fields.count);
}

pub const ORMapRow = struct {
    table_name: []const u8,
    row_key: ValidKey,
    fields: ORMapRowFields,
    tombstone: Tombstone,

    fn assert_valid(row: ORMapRow) void {
        assert(row.table_name.len > 0);
        assert(row.row_key.len > 0);

        for (
            row.fields.keys[0..row.fields.count],
            row.fields.dots[0..row.fields.count],
        ) |key, dot| {
            assert_field_key_valid(key);
            dot.assert_valid();
        }

        row.tombstone.assert_valid();
    }

    const UserRowView = struct {
        row: *const ORMapRow,

        pub fn get(self: @This(), key: []const u8) ?JsonBytes {
            if (std.mem.eql(u8, key, "_key")) {
                return self.row.row_key;
            }

            if (self.row.fields.get(key)) |field| {
                return field.value;
            }

            return null;
        }
    };

    pub fn user_row_view(self: *const @This()) UserRowView {
        return .{ .row = self };
    }
};

fn test_client_id(bytes: []const u8) ClientId {
    assert(bytes.len <= @sizeOf(ClientId));

    var id = [_]u8{0} ** @sizeOf(ClientId);
    @memcpy(id[0..bytes.len], bytes);
    return id;
}
test "to_user_row" {
    var fields = ORMapRowFields{};
    fields.put(
        "name",
        "\"max\"",
        .{
            .client_id = test_client_id("client_1"),
            .version = 1,
        },
    );
    fields.put(
        "age",
        "31",
        .{
            .client_id = test_client_id("client_1"),
            .version = 0,
        },
    );

    const row_key = "key-1";
    const or_map_row = ORMapRow{
        .table_name = "test",
        .row_key = row_key,
        .fields = fields,
        .tombstone = .{ .dot = null, .context = .{} },
    };

    const user_row = or_map_row.user_row_view();

    if (user_row.get("name")) |actual| {
        try std.testing.expectEqualStrings("\"max\"", actual);
    } else {
        @panic("missing 'name' field");
    }

    if (user_row.get("age")) |actual| {
        try std.testing.expectEqualStrings("31", actual);
    } else {
        @panic("missing 'age' field");
    }

    if (user_row.get("_key")) |key_value| {
        try std.testing.expectEqualStrings(row_key, key_value);
    } else {
        @panic("missing '_key' field");
    }
}

/// Applies one CRDT operation to an existing row.
///
/// Capacity invariant: rows passed to this function must be initialized with
/// enough field and tombstone-context capacity for all valid operations. This
/// function does not return capacity errors. A failed capacity assertion means
/// the caller violated that capacity contract, or the fixed backing storage was
/// sized incorrectly, so capacity exhaustion is treated as a bug instead of a
/// recoverable condition.
pub fn apply_operation_to_row(row: *ORMapRow, operation: CRDTOperation) void {
    operation.assert_valid();
    row.assert_valid();
    assert_capacity_for_operation(row, operation);
    defer row.assert_valid();

    switch (operation) {
        .set => |set_operation| {
            if (row.tombstone.active()) {
                const seen = row.tombstone.context
                    .get(set_operation.dot.client_id);
                if (seen != null and set_operation.dot.version <= seen.?) {
                    return; // Tombstone wins
                }
            }

            const field = set_operation.field.?;
            update_fields(
                .{
                    .field_key = field,
                    .value = set_operation.value,
                    .dot = set_operation.dot,
                },
                row,
            );
        },
        .set_row => |set_row_operation| {
            if (row.tombstone.active()) {
                const seen = row.tombstone.context
                    .get(set_row_operation.dot.client_id);
                if (seen != null and set_row_operation.dot.version <= seen.?) {
                    return; // Tombstone wins
                }
            }

            for (
                set_row_operation.value.keys[0..set_row_operation.value.count],
                set_row_operation.value.values[0..set_row_operation.value.count],
            ) |field_key, value| {
                update_fields(
                    .{
                        .field_key = field_key,
                        .value = value,
                        .dot = set_row_operation.dot,
                    },
                    row,
                );
            }
        },
        .remove => |remove_operation| {
            row.tombstone.merge_tombstone(remove_operation.tombstone);

            for (
                row.fields.keys[0..row.fields.count],
                row.fields.dots[0..row.fields.count],
            ) |key, dot| {
                if (row.tombstone.context.get(dot.client_id)) |remove_version| {
                    if (dot.version <= remove_version) {
                        _ = row.fields.remove(key);
                    }
                }
            }
        },
    }
}

fn assert_capacity_for_operation(row: *const ORMapRow, operation: CRDTOperation) void {
    switch (operation) {
        .set => |set_operation| {
            const field = set_operation.field.?;
            if (!row.fields.contains(field)) {
                assert(object_fields_max >= row.fields.count + 1);
            }
        },
        .set_row => |set_row_operation| {
            var missing_fields: @TypeOf(row.fields.count) = 0;
            for (
                set_row_operation.value.keys[0..set_row_operation.value.count],
            ) |field_key| {
                if (!row.fields.contains(field_key)) missing_fields += 1;
            }

            assert(object_fields_max >= row.fields.count + missing_fields);
        },
        .remove => |remove_operation| {
            var missing_context: usize = 0;
            const remove_context = remove_operation.tombstone.context;
            for (remove_context.ids[0..remove_context.count]) |id| {
                if (!row.tombstone.context.contains(id)) missing_context += 1;
            }

            assert(context_max >= row.tombstone.context.count + missing_context);
        },
    }
}

fn update_fields(
    operation: struct { field_key: []const u8, value: JsonBytes, dot: Dot },
    row: *ORMapRow,
) void {
    assert(operation.field_key.len > 0);
    operation.dot.assert_valid();
    row.assert_valid();
    defer row.assert_valid();

    if (pick_field(
        .{
            .field_key = operation.field_key,
            .value = operation.value,
            .dot = operation.dot,
        },
        row.*,
    ) == .operation) {
        row.fields.put(
            operation.field_key,
            operation.value,
            operation.dot,
        );
    }
}

fn pick_field(
    operation: struct {
        field_key: []const u8,
        value: JsonBytes,
        dot: Dot,
    },
    row: ORMapRow,
) enum {
    operation,
    row,
} {
    assert(operation.field_key.len > 0);
    operation.dot.assert_valid();
    row.assert_valid();
    defer row.assert_valid();

    if (row.fields.get(operation.field_key)) |row_field| {
        switch (operation.dot.order(row_field.dot)) {
            // Operations dot dominates Rows field, replace the fields value
            .gt => return .operation,
            .eq => std.debug.panic(
                "CRDT invariant violated: duplicate dot for field {s}",
                .{operation.field_key},
            ),
            else => return .row,
        }
    }
    return .operation;
}
test "apply_operation_to_row applies set_row set and remove to same row" {
    var row = ORMapRow{
        .table_name = "test",
        .row_key = "key-1",
        .fields = .{},
        .tombstone = .{ .dot = null, .context = .{} },
    };

    var set_row_value = SetRowFields{};
    set_row_value.put("name", "\"max\"");
    set_row_value.put("age", "31");

    apply_operation_to_row(&row, .{ .set_row = .{
        .table = "test",
        .row_key = "key-1",
        .value = set_row_value,
        .dot = .{ .client_id = test_client_id("client_1"), .version = 1 },
    } });

    try std.testing.expectEqual(@as(usize, 2), row.fields.count);
    try std.testing.expectEqualStrings("\"max\"", row.fields.get("name").?.value);
    try std.testing.expectEqualStrings("31", row.fields.get("age").?.value);

    apply_operation_to_row(&row, .{ .set = .{
        .table = "test",
        .row_key = "key-1",
        .field = "name",
        .value = "\"maxwell\"",
        .dot = .{ .client_id = test_client_id("client_1"), .version = 2 },
    } });

    try std.testing.expectEqual(@as(usize, 2), row.fields.count);
    try std.testing.expectEqualStrings("\"maxwell\"", row.fields.get("name").?.value);
    try std.testing.expectEqual(@as(i32, 2), row.fields.get("name").?.dot.version);

    var remove_context = Context{};
    remove_context.put_max(test_client_id("client_1"), 2);

    apply_operation_to_row(&row, .{ .remove = .{
        .table = "test",
        .row_key = "key-1",
        .tombstone = .{
            .dot = .{ .client_id = test_client_id("client_1"), .version = 3 },
            .context = remove_context,
        },
    } });

    try std.testing.expectEqual(@as(usize, 0), row.fields.count);
    try std.testing.expect(row.tombstone.active());
}

//  ------------------------------------------------------------------------
//  Utils
//  ------------------------------------------------------------------------
pub fn compare_dots(a: Dot, b: Dot) std.math.Order {
    const dot_order = a.order(b);
    assert(dot_order != .eq);
    return dot_order;
}

//  ------------------------------------------------------------------------
//  Assert helpers
//  ------------------------------------------------------------------------

fn assert_context_valid(context: Context) void {
    for (context.ids[0..context.count], context.versions[0..context.count]) |id, version| {
        assert(!std.mem.allEqual(u8, &id, 0));
        assert(version >= 0);
    }
}

fn assert_field_key_valid(field: []const u8) void {
    assert(field.len > 0);
    assert(!std.mem.eql(u8, field, "_key"));
}
