const std = @import("std");
const assert = std.debug.assert;

const set_row_fields_count_max = 200;
const row_field_registers_count_max = 200;
const version_vector_entries_count_max = 200;

comptime {
    assert(set_row_fields_count_max > 0);
    assert(row_field_registers_count_max > 0);
    assert(version_vector_entries_count_max > 0);
}

pub const JsonValueBytes = []const u8;

pub const ClientId = [16]u8;
pub fn client_id_from_bytes(client_id_bytes: []const u8) !ClientId {
    if (client_id_bytes.len != @sizeOf(ClientId)) return error.InvalidClientIdLength;

    var client_id: ClientId = undefined;
    @memcpy(&client_id, client_id_bytes);
    return client_id;
}

pub const Dot = struct {
    client_id: ClientId,
    version: i32,

    fn assert_valid(dot: Dot) void {
        assert(!std.mem.allEqual(u8, &dot.client_id, 0));
        assert(dot.version >= 0);
    }

    fn compare(self: @This(), other_dot: Dot) std.math.Order {
        self.assert_valid();
        other_dot.assert_valid();

        const version_order = std.math.order(self.version, other_dot.version);
        return switch (version_order) {
            .eq => std.mem.order(u8, &self.client_id, &other_dot.client_id),
            else => version_order,
        };
    }
};

pub const SetRowOperationFields = struct {
    field_keys: [set_row_fields_count_max][]const u8 = undefined,
    json_values: [set_row_fields_count_max]JsonValueBytes = undefined,
    count: usize = 0,

    pub fn get(self: *const @This(), field_key: []const u8) ?JsonValueBytes {
        assert_field_key_valid(field_key);
        assert(self.count <= set_row_fields_count_max);
        for (self.field_keys[0..self.count], self.json_values[0..self.count]) |entry_key, json_value| {
            if (std.mem.eql(u8, entry_key, field_key)) return json_value;
        }
        return null;
    }

    pub fn contains(self: *const @This(), field_key: []const u8) bool {
        assert_field_key_valid(field_key);
        return self.get(field_key) != null;
    }

    pub fn put(self: *@This(), field_key: []const u8, json_value: JsonValueBytes) void {
        assert_field_key_valid(field_key);
        assert(self.count <= set_row_fields_count_max);
        for (self.field_keys[0..self.count], self.json_values[0..self.count]) |entry_key, *entry_value| {
            if (std.mem.eql(u8, entry_key, field_key)) {
                entry_value.* = json_value;
                return;
            }
        }

        assert(self.count < set_row_fields_count_max);
        self.field_keys[self.count] = field_key;
        self.json_values[self.count] = json_value;
        self.count += 1;
        assert(self.count <= set_row_fields_count_max);
    }
};

pub const VersionVector = struct {
    client_ids: [version_vector_entries_count_max]ClientId = undefined,
    client_versions: [version_vector_entries_count_max]i32 = undefined,
    count: usize = 0,

    pub fn get(self: *const @This(), client_id: ClientId) ?i32 {
        assert(!std.mem.allEqual(u8, &client_id, 0));
        assert(self.count <= version_vector_entries_count_max);
        for (self.client_ids[0..self.count], self.client_versions[0..self.count]) |entry_client_id, entry_client_version| {
            if (std.mem.eql(u8, &entry_client_id, &client_id)) return entry_client_version;
        }
        return null;
    }

    pub fn contains(self: *const @This(), client_id: ClientId) bool {
        assert(!std.mem.allEqual(u8, &client_id, 0));
        return self.get(client_id) != null;
    }

    pub fn put_client_version_max(self: *@This(), client_id: ClientId, version: i32) void {
        assert(!std.mem.allEqual(u8, &client_id, 0));
        assert(version >= 0);
        assert(self.count <= version_vector_entries_count_max);
        for (self.client_ids[0..self.count], self.client_versions[0..self.count]) |entry_client_id, *entry_version| {
            if (std.mem.eql(u8, &entry_client_id, &client_id)) {
                entry_version.* = @max(entry_version.*, version);
                return;
            }
        }

        assert(self.count < version_vector_entries_count_max);
        self.client_ids[self.count] = client_id;
        self.client_versions[self.count] = version;
        self.count += 1;
        assert(self.count <= version_vector_entries_count_max);
    }
};

pub const RowKey = []const u8;
pub const CRDTOperation = union(enum) {
    set: struct {
        table_name: []const u8,
        row_key: RowKey,
        field_key: ?[]const u8,
        json_value: JsonValueBytes,
        dot: Dot,
    },
    set_row: struct {
        table_name: []const u8,
        row_key: RowKey,
        fields: SetRowOperationFields,
        dot: Dot,
    },
    remove_row: struct {
        table_name: []const u8,
        row_key: []const u8,
        tombstone: Tombstone,
    },

    fn assert_valid(operation: CRDTOperation) void {
        switch (operation) {
            .set => |set| {
                assert(set.table_name.len > 0);
                assert(set.row_key.len > 0);
                assert(set.field_key != null);
                assert_field_key_valid(set.field_key.?);
                set.dot.assert_valid();
            },
            .set_row => |set_row| {
                assert(set_row.table_name.len > 0);
                assert(set_row.row_key.len > 0);
                assert(set_row.fields.count <= set_row_fields_count_max);
                for (set_row.fields.field_keys[0..set_row.fields.count]) |field_key| {
                    assert_field_key_valid(field_key);
                }
                set_row.dot.assert_valid();
            },
            .remove_row => |remove_row| {
                assert(remove_row.table_name.len > 0);
                assert(remove_row.row_key.len > 0);
                assert(remove_row.tombstone.is_active());
                remove_row.tombstone.assert_valid();
            },
        }
    }
};

pub const LWWRegister = struct {
    value: JsonValueBytes,
    dot: Dot,
};

pub const Tombstone = struct {
    dot: ?Dot,
    version_vector: VersionVector = .{},

    fn merge_tombstone(self: *@This(), tombstone: Tombstone) void {
        self.assert_valid();
        tombstone.assert_valid();
        defer self.assert_valid();

        if (tombstone.dot) |dot| {
            if (self.dot == null or dot.compare(self.dot.?) == .gt) self.dot = dot;
            for (tombstone.version_vector.client_ids[0..tombstone.version_vector.count], tombstone.version_vector.client_versions[0..tombstone.version_vector.count]) |client_id, version| {
                self.version_vector.put_client_version_max(client_id, version);
            }
        }
    }

    pub fn is_active(tombstone: Tombstone) bool {
        return tombstone.dot != null;
    }

    pub fn assert_valid(tombstone: Tombstone) void {
        if (tombstone.dot) |dot| {
            dot.assert_valid();
            assert_version_vector_valid(tombstone.version_vector);
        } else {
            assert(tombstone.version_vector.count == 0);
        }
    }
};

pub const RowFieldRegisters = struct {
    field_keys: [row_field_registers_count_max][]const u8 = undefined,
    json_values: [row_field_registers_count_max]JsonValueBytes = undefined,
    field_dots: [row_field_registers_count_max]Dot = undefined,
    count: usize = 0,

    pub fn get_index(self: *const @This(), field_key: []const u8) ?usize {
        assert(field_key.len > 0);
        assert(self.count <= row_field_registers_count_max);
        for (self.field_keys[0..self.count], 0..self.count) |entry_key, index| {
            if (std.mem.eql(u8, entry_key, field_key)) return index;
        }
        return null;
    }

    pub fn get(self: *const @This(), field_key: []const u8) ?LWWRegister {
        assert(field_key.len > 0);
        assert(self.count <= row_field_registers_count_max);
        if (self.get_index(field_key)) |index| {
            assert(index < self.count);
            return .{ .value = self.json_values[index], .dot = self.field_dots[index] };
        }
        return null;
    }

    pub fn contains(self: *const @This(), field_key: []const u8) bool {
        assert(field_key.len > 0);
        assert(self.count <= row_field_registers_count_max);
        return self.get_index(field_key) != null;
    }

    pub fn put(self: *@This(), field_key: []const u8, json_value: JsonValueBytes, dot: Dot) void {
        assert(field_key.len > 0);
        assert(self.count <= row_field_registers_count_max);
        dot.assert_valid();

        for (self.field_keys[0..self.count], self.json_values[0..self.count], self.field_dots[0..self.count]) |entry_key, *entry_value, *entry_dot| {
            if (std.mem.eql(u8, entry_key, field_key)) {
                entry_value.* = json_value;
                entry_dot.* = dot;
                return;
            }
        }

        assert(self.count < row_field_registers_count_max);
        self.field_keys[self.count] = field_key;
        self.json_values[self.count] = json_value;
        self.field_dots[self.count] = dot;
        self.count += 1;
        assert(self.count <= row_field_registers_count_max);
    }

    pub fn remove(self: *@This(), field_key: []const u8) bool {
        assert(field_key.len > 0);
        assert(self.count <= row_field_registers_count_max);

        const index = self.get_index(field_key) orelse return false;
        assert(index < self.count);

        var shift_index = index;
        while (shift_index + 1 < self.count) : (shift_index += 1) {
            self.field_keys[shift_index] = self.field_keys[shift_index + 1];
            self.json_values[shift_index] = self.json_values[shift_index + 1];
            self.field_dots[shift_index] = self.field_dots[shift_index + 1];
        }

        self.count -= 1;
        assert(self.count <= row_field_registers_count_max);
        return true;
    }

    pub fn clear(self: *@This()) void {
        assert(self.count <= row_field_registers_count_max);
        self.count = 0;
    }
};

pub const ORMapRow = struct {
    table_name: []const u8,
    row_key: RowKey,
    fields: RowFieldRegisters,
    tombstone: Tombstone,

    fn assert_valid(row: ORMapRow) void {
        assert(row.table_name.len > 0);
        assert(row.row_key.len > 0);
        assert(row.fields.count <= row_field_registers_count_max);
        for (row.fields.field_keys[0..row.fields.count], row.fields.field_dots[0..row.fields.count]) |field_key, dot| {
            assert_field_key_valid(field_key);
            dot.assert_valid();
        }
        row.tombstone.assert_valid();
    }

    const UserRowView = struct {
        row: *const ORMapRow,

        pub fn get(self: @This(), field_key: []const u8) ?JsonValueBytes {
            assert(field_key.len > 0);
            if (std.mem.eql(u8, field_key, "_key")) return self.row.row_key;
            if (self.row.fields.get(field_key)) |field| return field.value;
            return null;
        }
    };

    pub fn user_row_view(self: *const @This()) UserRowView {
        return .{ .row = self };
    }
};

pub fn apply_operation_to_row(row: *ORMapRow, operation: CRDTOperation) void {
    operation.assert_valid();
    row.assert_valid();
    assert_operation_targets_row(row, operation);
    assert_capacity_for_operation(row, operation);
    defer row.assert_valid();

    switch (operation) {
        .set => |set_operation| {
            if (row.tombstone.is_active()) {
                const seen_version = row.tombstone.version_vector.get(set_operation.dot.client_id);
                if (seen_version != null and set_operation.dot.version <= seen_version.?) return;
            }

            update_field(.{
                .field_key = set_operation.field_key.?,
                .json_value = set_operation.json_value,
                .dot = set_operation.dot,
            }, row);
        },
        .set_row => |set_row_operation| {
            if (row.tombstone.is_active()) {
                const seen_version = row.tombstone.version_vector.get(set_row_operation.dot.client_id);
                if (seen_version != null and set_row_operation.dot.version <= seen_version.?) return;
            }

            for (set_row_operation.fields.field_keys[0..set_row_operation.fields.count], set_row_operation.fields.json_values[0..set_row_operation.fields.count]) |field_key, json_value| {
                update_field(.{ .field_key = field_key, .json_value = json_value, .dot = set_row_operation.dot }, row);
            }
        },
        .remove_row => |remove_row_operation| {
            row.tombstone.merge_tombstone(remove_row_operation.tombstone);
            for (row.fields.field_keys[0..row.fields.count], row.fields.field_dots[0..row.fields.count]) |field_key, dot| {
                if (row.tombstone.version_vector.get(dot.client_id)) |remove_version_max| {
                    if (dot.version <= remove_version_max) _ = row.fields.remove(field_key);
                }
            }
        },
    }
}

fn assert_operation_targets_row(row: *const ORMapRow, operation: CRDTOperation) void {
    row.assert_valid();
    operation.assert_valid();

    switch (operation) {
        .set => |set_operation| {
            assert(std.mem.eql(u8, row.table_name, set_operation.table_name));
            assert(std.mem.eql(u8, row.row_key, set_operation.row_key));
        },
        .set_row => |set_row_operation| {
            assert(std.mem.eql(u8, row.table_name, set_row_operation.table_name));
            assert(std.mem.eql(u8, row.row_key, set_row_operation.row_key));
        },
        .remove_row => |remove_row_operation| {
            assert(std.mem.eql(u8, row.table_name, remove_row_operation.table_name));
            assert(std.mem.eql(u8, row.row_key, remove_row_operation.row_key));
        },
    }
}

fn assert_capacity_for_operation(row: *const ORMapRow, operation: CRDTOperation) void {
    row.assert_valid();
    operation.assert_valid();

    switch (operation) {
        .set => |set_operation| {
            const field_key = set_operation.field_key.?;
            if (!row.fields.contains(field_key)) assert(row_field_registers_count_max >= row.fields.count + 1);
        },
        .set_row => |set_row_operation| {
            var missing_fields_count: @TypeOf(row.fields.count) = 0;
            for (set_row_operation.fields.field_keys[0..set_row_operation.fields.count]) |field_key| {
                if (!row.fields.contains(field_key)) missing_fields_count += 1;
            }
            assert(row_field_registers_count_max >= row.fields.count + missing_fields_count);
        },
        .remove_row => |remove_row_operation| {
            var missing_version_vector_entries_count: usize = 0;
            const remove_version_vector = remove_row_operation.tombstone.version_vector;
            for (remove_version_vector.client_ids[0..remove_version_vector.count]) |client_id| {
                if (!row.tombstone.version_vector.contains(client_id)) missing_version_vector_entries_count += 1;
            }
            assert(version_vector_entries_count_max >= row.tombstone.version_vector.count + missing_version_vector_entries_count);
        },
    }
}

const FieldUpdate = struct { field_key: []const u8, json_value: JsonValueBytes, dot: Dot };

fn update_field(field_update: FieldUpdate, row: *ORMapRow) void {
    assert_field_key_valid(field_update.field_key);
    field_update.dot.assert_valid();
    row.assert_valid();
    defer row.assert_valid();

    if (pick_field_winner(field_update, row.*) == .incoming) {
        row.fields.put(field_update.field_key, field_update.json_value, field_update.dot);
    }
}

fn pick_field_winner(field_update: FieldUpdate, row: ORMapRow) enum { incoming, existing } {
    assert_field_key_valid(field_update.field_key);
    field_update.dot.assert_valid();
    row.assert_valid();
    defer row.assert_valid();

    if (row.fields.get(field_update.field_key)) |existing_field| {
        switch (field_update.dot.compare(existing_field.dot)) {
            .gt => return .incoming,
            .eq => std.debug.panic("CRDT invariant violated: duplicate dot for field {s}", .{field_update.field_key}),
            else => return .existing,
        }
    }
    return .incoming;
}

fn test_client_id(client_id_bytes: []const u8) ClientId {
    assert(client_id_bytes.len <= @sizeOf(ClientId));
    var client_id = [_]u8{0} ** @sizeOf(ClientId);
    @memcpy(client_id[0..client_id_bytes.len], client_id_bytes);
    return client_id;
}

test "RowFieldRegisters put get remove and clear" {
    var fields = RowFieldRegisters{};
    const client_id = test_client_id("client_1");
    const first_dot = Dot{ .client_id = client_id, .version = 1 };
    const second_dot = Dot{ .client_id = client_id, .version = 2 };
    const third_dot = Dot{ .client_id = client_id, .version = 3 };

    fields.put("name", "\"max\"", first_dot);
    fields.put("age", "31", second_dot);

    try std.testing.expect(fields.contains("name"));
    try std.testing.expect(fields.contains("age"));
    try std.testing.expectEqualStrings("\"max\"", fields.get("name").?.value);
    try std.testing.expectEqualStrings("31", fields.get("age").?.value);

    fields.put("name", "\"maxwell\"", third_dot);
    try std.testing.expectEqualStrings("\"maxwell\"", fields.get("name").?.value);
    try std.testing.expectEqual(@as(i32, 3), fields.get("name").?.dot.version);

    try std.testing.expect(fields.remove("name"));
    try std.testing.expect(!fields.contains("name"));
    try std.testing.expect(fields.contains("age"));

    try std.testing.expect(fields.remove("age"));
    try std.testing.expect(!fields.remove("missing"));
    fields.clear();
    try std.testing.expectEqual(@as(usize, 0), fields.count);
}

test "to_user_row" {
    var fields = RowFieldRegisters{};
    fields.put("name", "\"max\"", .{ .client_id = test_client_id("client_1"), .version = 1 });
    fields.put("age", "31", .{ .client_id = test_client_id("client_1"), .version = 0 });

    const row_key = "key-1";
    const row = ORMapRow{
        .table_name = "test",
        .row_key = row_key,
        .fields = fields,
        .tombstone = .{ .dot = null, .version_vector = .{} },
    };

    const user_row = row.user_row_view();
    try std.testing.expectEqualStrings("\"max\"", user_row.get("name").?);
    try std.testing.expectEqualStrings("31", user_row.get("age").?);
    try std.testing.expectEqualStrings(row_key, user_row.get("_key").?);
}

test "apply_operation_to_row applies set_row set and remove_row to same row" {
    var row = ORMapRow{
        .table_name = "test",
        .row_key = "key-1",
        .fields = .{},
        .tombstone = .{ .dot = null, .version_vector = .{} },
    };

    var set_row_fields = SetRowOperationFields{};
    set_row_fields.put("name", "\"max\"");
    set_row_fields.put("age", "31");

    apply_operation_to_row(&row, .{ .set_row = .{
        .table_name = "test",
        .row_key = "key-1",
        .fields = set_row_fields,
        .dot = .{ .client_id = test_client_id("client_1"), .version = 1 },
    } });

    try std.testing.expectEqual(@as(usize, 2), row.fields.count);
    try std.testing.expectEqualStrings("\"max\"", row.fields.get("name").?.value);
    try std.testing.expectEqualStrings("31", row.fields.get("age").?.value);

    apply_operation_to_row(&row, .{ .set = .{
        .table_name = "test",
        .row_key = "key-1",
        .field_key = "name",
        .json_value = "\"maxwell\"",
        .dot = .{ .client_id = test_client_id("client_1"), .version = 2 },
    } });

    try std.testing.expectEqualStrings("\"maxwell\"", row.fields.get("name").?.value);
    try std.testing.expectEqual(@as(i32, 2), row.fields.get("name").?.dot.version);

    var remove_version_vector = VersionVector{};
    remove_version_vector.put_client_version_max(test_client_id("client_1"), 2);

    apply_operation_to_row(&row, .{ .remove_row = .{
        .table_name = "test",
        .row_key = "key-1",
        .tombstone = .{
            .dot = .{ .client_id = test_client_id("client_1"), .version = 3 },
            .version_vector = remove_version_vector,
        },
    } });

    try std.testing.expectEqual(@as(usize, 0), row.fields.count);
    try std.testing.expect(row.tombstone.is_active());
}

fn assert_version_vector_valid(version_vector: VersionVector) void {
    for (version_vector.client_ids[0..version_vector.count], version_vector.client_versions[0..version_vector.count]) |client_id, version| {
        assert(!std.mem.allEqual(u8, &client_id, 0));
        assert(version >= 0);
    }
}

fn assert_field_key_valid(field_key: []const u8) void {
    assert(field_key.len > 0);
    assert(!std.mem.eql(u8, field_key, "_key"));
}
