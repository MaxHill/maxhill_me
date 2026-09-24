/// TODO: is i32 the correct type for version and contexts
///
const std = @import("std");
const assert = std.debug.assert;

const object_fields_max = 200;

const Dot = struct {
    client_id: []const u8,
    version: i32,

    fn is_valid(dot: @This()) bool {
        return dot.client_id.len > 0 and dot.version >= 0;
    }

    fn equal(a: @This(), b: Dot) bool {
        return a.version == b.version and std.mem.eql(u8, a.client_id, b.client_id);
    }
};

const ValidKey = []const u8;

const CRDTOperation = union(enum) {
    set: struct {
        table: []u8,
        row_key: []u8,
        field: ?[]u8,
        value: std.json.Value,
        dot: Dot,
    },
    set_row: struct {
        table: []u8,
        row_key: []u8,
        fields: ?[]u8,
        value: std.json.Value,
        dot: Dot,
    },
    remove: struct {
        table: []u8,
        row_key: []u8,
        dot: Dot,
        context: std.StringHashMap(i32), // Always present (empty object for non-remove operations)
    },

    fn is_valid(operation: @This()) bool {
        switch (operation) {
            .set => |set| {
                return set.table.len > 0 and
                    set.row_key.len > 0 and
                    set.field != null and
                    set.field.?.len > 0 and
                    set.dot.is_valid();
            },
            .set_row => |set_row| {
                return set_row.table.len > 0 and
                    set_row.row_key.len > 0 and
                    set_row.fields == null and
                    set_row.dot.is_valid();
            },
            .remove => |remove| {
                return remove.table.len > 0 and
                    remove.row_key.len > 0 and
                    remove.dot.is_valid() and
                    context_valid(remove.context);
            },
        }
    }
};

const LWWField = struct {
    value: std.json.Value,
    dot: Dot,
};

const ORMapRow = struct {
    table_name: []const u8,
    row_key: ValidKey,
    fields: std.StringHashMap(LWWField),
    tombstone: ?struct {
        dot: Dot,
        context: std.StringHashMap(i32), // tracks which dots were observed by this delete
    },

    fn is_valid(row: ORMapRow) bool {
        if (row.table_name.len == 0) return false;
        if (row.row_key.len == 0) return false;

        var fields = row.fields.iterator();
        while (fields.next()) |entry| {
            if (!field_key_valid(entry.key_ptr.*)) return false;
            if (!entry.value_ptr.dot.is_valid()) return false;
        }

        if (row.tombstone) |tombstone| {
            if (!tombstone.dot.is_valid()) return false;
            if (!context_valid(tombstone.context)) return false;
        }
        return true;
    }

    fn field_key_valid(field: []const u8) bool {
        return field.len > 0 and !std.mem.eql(u8, field, "_key");
    }
};

const UserRow = std.StringHashMap(std.json.Value);

/// Converts an internal row to a user-facing row by
/// constructing an object of field values.
pub fn to_user_row(out: *UserRow, row: ORMapRow) !bool {
    assert(out.count() == 0);
    assert(out.capacity() >= row.fields.count() + 1);
    assert(row.is_valid());

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

test "to_user_row" {
    const allocator = std.testing.allocator;

    var user_row = std.StringHashMap(std.json.Value).init(allocator);
    defer user_row.deinit();
    try user_row.ensureTotalCapacity(3); // name, age, and _key

    var fields = std.StringHashMap(LWWField).init(allocator);
    defer fields.deinit();

    const name_value = LWWField{
        .value = .{ .string = "max" },
        .dot = Dot{ .client_id = "client_1", .version = 1 },
    };
    try fields.put("name", name_value);

    const age_value = LWWField{
        .value = .{ .integer = 31 },
        .dot = Dot{ .client_id = "client_1", .version = 0 },
    };
    try fields.put("age", age_value);

    const row_key = "key-1";
    const or_map_row = ORMapRow{
        .table_name = "test",
        .row_key = row_key,
        .fields = fields,
        .tombstone = null,
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

pub fn apply_operation_to_row(row: ORMapRow, operation: CRDTOperation) null {
    assert(operation.is_valid());
    assert(row.is_valid());
    // TODO: Implement
    assert(row.is_valid());
}

//  ------------------------------------------------------------------------
//  Utils
//  ------------------------------------------------------------------------
pub fn compare_dots(a: Dot, b: Dot) std.math.Order {
    assert(a.is_valid());
    assert(b.is_valid());
    assert(!a.equal(b));

    const version_order = std.math.order(a.version, b.version);
    if (version_order != .eq) return version_order;

    const client_order = std.mem.order(u8, a.client_id, b.client_id);
    assert(client_order != .eq);
    return client_order;
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

fn context_valid(context: std.StringHashMap(i32)) bool {
    var iterator = context.iterator();
    while (iterator.next()) |entry| {
        if (entry.key_ptr.*.len <= 0) return false;
        if (entry.value_ptr.* < 0) return false;
    }
    return true;
}
