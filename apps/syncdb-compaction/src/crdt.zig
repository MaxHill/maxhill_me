/// TODO: is i32 the correct type for version and contexts
///
/// TODO: Derive fixed-buffer byte capacities from the hash-map entry bounds
/// and check the relationship at comptime where Zig's hash-map layout permits.
const std = @import("std");
const assert = std.debug.assert;

const object_fields_max = 200;
const context_max = 200;

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

        const version_order = std.math.order(self.version, target.version);
        return switch (version_order) {
            .eq => std.mem.order(u8, &self.client_id, &target.client_id),
            else => version_order,
        };
    }
};

pub const Context = struct {
    ids: [context_max]ClientId = undefined,
    versions: [context_max]i32 = undefined,
    count: usize = 0,

    pub fn get(c: *const Context, id: ClientId) ?i32 {
        for (c.ids[0..c.count], c.versions[0..c.count]) |x, v| {
            if (std.mem.eql(u8, &x, &id)) return v;
        }
        return null;
    }

    pub fn contains(c: *const Context, id: ClientId) bool {
        return c.get(id) != null;
    }

    pub fn put_max(self: *@This(), id: ClientId, version: i32) void {
        assert(version >= 0);
        for (self.ids[0..self.count], self.versions[0..self.count]) |entry_id, *entry_version| {
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
        value: std.json.Value,
        dot: Dot,
    },
    set_row: struct {
        table: []const u8,
        row_key: []const u8,
        value: std.StringHashMap(std.json.Value),
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
    value: std.json.Value,
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
        for (context.ids[0..context.count], context.versions[0..context.count]) |id, v|
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

pub const ORMapRow = struct {
    table_name: []const u8,
    row_key: ValidKey,
    fields: std.StringHashMap(LWWField),
    tombstone: Tombstone,

    fn assert_valid(row: ORMapRow) void {
        assert(row.table_name.len > 0);
        assert(row.row_key.len > 0);

        var fields = row.fields.iterator();
        while (fields.next()) |entry| {
            assert_field_key_valid(entry.key_ptr.*);
            entry.value_ptr.dot.assert_valid();
        }

        row.tombstone.assert_valid();
    }
};

pub const UserRow = std.StringHashMap(std.json.Value);

/// Converts an internal row to a user-facing row by
/// constructing an object of field values.
pub fn to_user_row(out: *UserRow, row: ORMapRow) !bool {
    assert(out.count() == 0);
    assert(out.capacity() >= row.fields.count() + 1);
    row.assert_valid();

    if (row.fields.count() == 0) {
        assert(out.count() == 0);
        return false;
    }

    try out.put("_key", .{ .string = row.row_key });

    var iterator = row.fields.iterator();
    while (iterator.next()) |field| {
        try out.put(field.key_ptr.*, field.value_ptr.value);
    }

    assert(out.count() == row.fields.count() + 1);
    assert(out.contains("_key"));
    return true;
}

fn test_client_id(bytes: []const u8) ClientId {
    assert(bytes.len <= @sizeOf(ClientId));

    var id = [_]u8{0} ** @sizeOf(ClientId);
    @memcpy(id[0..bytes.len], bytes);
    return id;
}

test "to_user_row" {
    const allocator = std.testing.allocator;

    var user_row = std.StringHashMap(std.json.Value).init(allocator);
    defer user_row.deinit();
    try user_row.ensureTotalCapacity(3); // name, age, and _key

    var fields = std.StringHashMap(LWWField).init(allocator);
    defer fields.deinit();

    const name_value = LWWField{
        .value = .{ .string = "max" },
        .dot = Dot{ .client_id = test_client_id("client_1"), .version = 1 },
    };
    try fields.put("name", name_value);

    const age_value = LWWField{
        .value = .{ .integer = 31 },
        .dot = Dot{ .client_id = test_client_id("client_1"), .version = 0 },
    };
    try fields.put("age", age_value);

    const row_key = "key-1";
    const or_map_row = ORMapRow{
        .table_name = "test",
        .row_key = row_key,
        .fields = fields,
        .tombstone = .{ .dot = null, .context = .{} },
    };

    const result = try to_user_row(&user_row, or_map_row);
    try std.testing.expect(result);

    if (user_row.get("name")) |actual| {
        try std.testing.expectEqualStrings("max", actual.string);
    } else {
        @panic("missing 'name' field");
    }

    if (user_row.get("age")) |actual| {
        try std.testing.expectEqual(@as(i64, 31), actual.integer);
    } else {
        @panic("missing 'age' field");
    }

    if (user_row.get("_key")) |key_value| {
        try std.testing.expectEqualStrings(row_key, key_value.string);
    } else {
        @panic("missing '_key' field");
    }
}

test "apply_operation_to_row applies set_row set and remove to same row" {
    const allocator = std.testing.allocator;

    var row = ORMapRow{
        .table_name = "test",
        .row_key = "key-1",
        .fields = std.StringHashMap(LWWField).init(allocator),
        .tombstone = .{ .dot = null, .context = .{} },
    };
    defer row.fields.deinit();
    try row.fields.ensureTotalCapacity(2);

    var set_row_value = std.StringHashMap(std.json.Value).init(allocator);
    defer set_row_value.deinit();
    try set_row_value.put("name", .{ .string = "max" });
    try set_row_value.put("age", .{ .integer = 31 });

    apply_operation_to_row(&row, .{ .set_row = .{
        .table = "test",
        .row_key = "key-1",
        .value = set_row_value,
        .dot = .{ .client_id = test_client_id("client_1"), .version = 1 },
    } });

    try std.testing.expectEqual(@as(u32, 2), row.fields.count());
    try std.testing.expectEqualStrings("max", row.fields.get("name").?.value.string);
    try std.testing.expectEqual(@as(i64, 31), row.fields.get("age").?.value.integer);

    apply_operation_to_row(&row, .{ .set = .{
        .table = "test",
        .row_key = "key-1",
        .field = "name",
        .value = .{ .string = "maxwell" },
        .dot = .{ .client_id = test_client_id("client_1"), .version = 2 },
    } });

    try std.testing.expectEqual(@as(u32, 2), row.fields.count());
    try std.testing.expectEqualStrings("maxwell", row.fields.get("name").?.value.string);
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

    try std.testing.expectEqual(@as(u32, 0), row.fields.count());
    try std.testing.expect(row.tombstone.active());
}

/// Applies one CRDT operation to an existing row.
///
/// Capacity invariant: rows passed to this function must be initialized with
/// enough field and tombstone-context capacity for all valid operations. This
/// function does not return allocation errors. A failed `put` means the caller
/// violated that capacity contract, or the fixed backing storage was sized
/// incorrectly, so allocation failure is treated as a bug instead of a
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

            var value_iterator = set_row_operation.value.iterator();
            while (value_iterator.next()) |field| {
                update_fields(
                    .{
                        .field_key = field.key_ptr.*,
                        .value = field.value_ptr.*,
                        .dot = set_row_operation.dot,
                    },
                    row,
                );
            }
        },
        .remove => |remove_operation| {
            row.tombstone.merge_tombstone(remove_operation.tombstone);

            var row_iterator = row.fields.iterator();
            while (row_iterator.next()) |field| {
                if (row.tombstone.context.get(field.value_ptr.dot.client_id)) |remove_version| {
                    if (field.value_ptr.dot.version <= remove_version) {
                        _ = row.fields.remove(field.key_ptr.*);
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
                assert(row.fields.capacity() >= row.fields.count() + 1);
            }
        },
        .set_row => |set_row_operation| {
            var missing_fields: @TypeOf(row.fields.count()) = 0;
            var value_iterator = set_row_operation.value.iterator();
            while (value_iterator.next()) |field| {
                if (!row.fields.contains(field.key_ptr.*)) missing_fields += 1;
            }

            assert(row.fields.capacity() >= row.fields.count() + missing_fields);
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
    operation: struct {
        field_key: []const u8,
        value: std.json.Value,
        dot: Dot,
    },
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
            .{
                .value = operation.value,
                .dot = operation.dot,
            },
        ) catch |err| {
            std.debug.panic("row fields capacity invariant violated: {}", .{err});
        };
    }
}

fn pick_field(
    operation: struct {
        field_key: []const u8,
        value: std.json.Value,
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
            // Rows dot and operations dot are equal but operation wins by value tiebreaking
            .eq => if (compare_values(
                operation.value,
                row_field.value,
            ) == .gt) {
                return .operation;
            } else {
                // Both values and dot's are equal, no operation needed
                return .row;
            },
            else => return .row,
        }
    }
    return .operation;
}

//  ------------------------------------------------------------------------
//  Utils
//  ------------------------------------------------------------------------
pub fn compare_dots(a: Dot, b: Dot) std.math.Order {
    const dot_order = a.order(b);
    assert(dot_order != .eq);
    return dot_order;
}

pub fn compare_values(a: std.json.Value, b: std.json.Value) std.math.Order {
    var ord = compare_value_type(a, b);
    if (ord != .eq) return ord;

    ord = switch (a) {
        .null => .eq,
        .bool => |a_bool| std.math.order(@intFromBool(a_bool), @intFromBool(b.bool)),
        .integer => |a_integer| std.math.order(a_integer, b.integer),
        .float => |a_float| {
            assert(!std.math.isNan(a_float));
            assert(!std.math.isNan(b.float));
            return std.math.order(a_float, b.float);
        },
        .number_string => |a_number_string| std.mem.order(u8, a_number_string, b.number_string),
        .string => |a_string| std.mem.order(u8, a_string, b.string),
        .array => |a_array| compare_arrays(a_array, b.array),
        .object => |a_object| compare_objects(a_object, b.object),
    };

    return ord;
}

test "compare_values sanity checks" {
    try std.testing.expect(compare_values(.{ .integer = 1 }, .{ .integer = 2 }) == .lt);
    try std.testing.expect(compare_values(.{ .string = "abcd" }, .{ .string = "abc" }) == .gt);
    try std.testing.expect(compare_values(.{ .bool = false }, .{ .bool = true }) == .lt);

    // Type order check: integer < string
    try std.testing.expect(compare_values(.{ .integer = 1 }, .{ .string = "1" }) == .lt);
}

fn value_type_rank(value: std.json.Value) u8 {
    return switch (value) {
        .null => 0,
        .bool => 1,
        .integer => 2,
        .float => 3,
        .number_string => 4,
        .string => 5,
        .array => 6,
        .object => 7,
    };
}

// This test is a duplication by design
// because we should never change the
// ordering of types since that
// will change determinism
// semantics.
test "value_type_rank" {
    var array = std.json.Array.init(std.testing.allocator);
    defer array.deinit();

    const object: std.json.ObjectMap = .{};

    assert(value_type_rank(.null) == 0);
    assert(value_type_rank(.{ .bool = false }) == 1);
    assert(value_type_rank(.{ .integer = 1 }) == 2);
    assert(value_type_rank(.{ .float = 1 }) == 3);
    assert(value_type_rank(.{ .number_string = "1" }) == 4);
    assert(value_type_rank(.{ .string = "str" }) == 5);
    assert(value_type_rank(.{ .array = array }) == 6);
    assert(value_type_rank(.{ .object = object }) == 7);
}

/// Compare json types with the following order:
/// null < bool < integer < float < number_string < string < array < object
pub fn compare_value_type(a: std.json.Value, b: std.json.Value) std.math.Order {
    return std.math.order(value_type_rank(a), value_type_rank(b));
}

fn compare_arrays(a: std.json.Array, b: std.json.Array) std.math.Order {
    const n = @min(a.items.len, b.items.len);
    var i: usize = 0;
    while (i < n) : (i += 1) {
        const o = compare_values(a.items[i], b.items[i]); // TODO: remove recursion
        if (o != .eq) return o;
    }
    return std.math.order(a.items.len, b.items.len);
}

fn next_object_key_after(object_map: std.json.ObjectMap, previous_key: ?[]const u8) ?[]const u8 {
    var iterator = object_map.iterator();
    var best: ?[]const u8 = null;

    while (iterator.next()) |entry| {
        const key = entry.key_ptr.*;
        if (previous_key) |previous| {
            if (std.mem.order(u8, key, previous) != .gt) continue;
        }
        if (best == null or std.mem.order(u8, key, best.?) == .lt) {
            best = key;
        }
    }
    return best;
}

/// Note that this function is O(n^2) to avoids allocations.
/// This should be fine since most values should be tie
/// broken before getting to this stage.
fn compare_objects(a: std.json.ObjectMap, b: std.json.ObjectMap) std.math.Order {
    assert(a.count() <= object_fields_max);
    assert(b.count() <= object_fields_max);
    var previous: ?[]const u8 = null;

    while (true) {
        const ka = next_object_key_after(a, previous);
        const kb = next_object_key_after(b, previous);

        if (ka == null and kb == null) return .eq;
        if (ka == null) return .lt;
        if (kb == null) return .gt;

        const ko = std.mem.order(u8, ka.?, kb.?);
        if (ko != .eq) return ko;

        const va = a.get(ka.?) orelse {
            assert(false);
            unreachable;
        };
        const vb = b.get(kb.?) orelse {
            assert(false);
            unreachable;
        };

        const vo = compare_values(va, vb);
        if (vo != .eq) return vo;

        previous = ka.?;
    }
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
