/// TODO: is i32 the correct type for version and contexts
///
const std = @import("std");
const assert = std.debug.assert;
const Dot = struct {
    client_id: []const u8,
    version: i32,
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
        field: ?[]u8,
        value: std.json.Value,
        dot: Dot,
    },
    remove: struct {
        table: []u8,
        row_key: []u8,
        dot: Dot,
        context: std.StringHashMap(i32), // Always present (empty object for non-remove operations)
    },
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
};

const UserRow = std.StringHashMap(std.json.Value);

pub fn toUserRow(out: *UserRow, row: ORMapRow) !bool {
    assert(out.count() == 0);
    assert(out.capacity() >= row.fields.count() + 1);

    if (row.fields.count() == 0) {
        return false;
    }

    try out.put("_key", .{ .string = row.row_key });

    var iterator = row.fields.iterator();
    while (iterator.next()) |field| {
        try out.put(field.key_ptr.*, field.value_ptr.value);
    }

    assert(out.count() == row.fields.count() + 1);
    return true;
}

test "toUserRow" {
    const allocator = std.testing.allocator;

    var user_row = std.StringHashMap(std.json.Value).init(allocator);
    try user_row.ensureTotalCapacity(3); // capacity is 3 to be able to fit the name, age and _key fields

    var fields = std.StringHashMap(LWWField).init(allocator);
    defer fields.deinit();
    const name_value = LWWField{
        .value = .{ .string = "max" },
        .dot = Dot{
            .client_id = "client_1",
            .version = 0,
        },
    };
    try fields.put("name", name_value);
    const age_value = LWWField{
        .value = .{ .integer = 31 },
        .dot = Dot{
            .client_id = "client_1",
            .version = 0,
        },
    };
    try fields.put("age", age_value);

    const row_key = "key-1";
    const or_map_row = ORMapRow{
        .table_name = "test",
        .row_key = row_key,
        .fields = fields,
        .tombstone = null,
    };

    const result = try toUserRow(&user_row, or_map_row);
    if (result) {
        defer user_row.deinit();
        if (user_row.get("name")) |actual| {
            try std.testing.expectEqualStrings("max", actual.string);
        } else {
            @panic("missing 'name' field");
        }

        if (user_row.get("age")) |actual| {
            try std.testing.expectEqual(31, actual.integer);
        } else {
            @panic("missing 'age' field");
        }

        if (user_row.get("_key")) |key_value| {
            try std.testing.expectEqualStrings(row_key, key_value.string);
        } else {
            @panic("missing '_key' field");
        }
    } else {
        @panic("User to row convertion failed");
    }
}

pub fn apply_operation_to_row(row: ORMapRow, operation: CRDTOperation) null {
    assert(row.fields.count() > 0);
    assert(operation.dot.version > 0);
}

//  ------------------------------------------------------------------------
//  Utils
//  ------------------------------------------------------------------------
pub fn compare_dots(a: Dot, b: Dot) std.math.Order {
    assert(a.client_id != b.client_id);
    if (a.version != b.version) {
        return a.version - b.version;
    }

    const order = (std.math.order(u8, a.client_id, b.client_id));

    assert(order != .eq);
    return order;
}

/// This is our last line of defense if dots are equal we use
/// this function to tiebreak. Therefore if we endup with an .eq value we
/// should shut down because this will break our protocole
pub fn tiebreak_compare_values(a: std.json.Value, b: std.json.Value) std.math.Order {
    var ord = type_compare(a, b);
    if (ord != .eq) return ord;

    ord = switch (a) {
        .null => .eq,
        .bool => |a_bool| std.math.order(@intFromBool(a_bool), @intFromBool(b.bool)),
        .integer => |a_integer| std.math.order(a_integer, b.integer),
        .float => |a_float| std.math.order(a_float, b.float),
        .number_string => |a_number_string| std.mem.order(u8, a_number_string, b.number_string),
        .string => |a_string| std.mem.order(u8, a_string, b.string),
        .array => |a_array| compare_arrays(a_array, b.array),
        .object => |a_object| compare_objects(a_object, b.object),
    };

    assert(ord != .eq);
    return ord;
}

test "compare_values sanity checks" {
    try std.testing.expect(tiebreak_compare_values(.{ .integer = 1 }, .{ .integer = 2 }) == .lt);
    try std.testing.expect(tiebreak_compare_values(.{ .string = "abcd" }, .{ .string = "abc" }) == .gt);
    try std.testing.expect(tiebreak_compare_values(.{ .bool = false }, .{ .bool = true }) == .lt);

    // Type order check: integer < string
    try std.testing.expect(tiebreak_compare_values(.{ .integer = 1 }, .{ .string = "1" }) == .lt);
}

/// Compare json types with the following order:
/// null < bool < integer < float < number_string < string < array < object
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

pub fn type_compare(a: std.json.Value, b: std.json.Value) std.math.Order {
    return std.math.order(value_type_rank(a), value_type_rank(b));
}

fn compare_arrays(a: std.json.Array, b: std.json.Array) std.math.Order {
    const n = @min(a.items.len, b.items.len);
    var i: usize = 0;
    while (i < n) : (i += 1) {
        const o = tiebreak_compare_values(a.items[i], b.items[i]); // TODO: remove recursion
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
    var previous: ?[]const u8 = null;

    while (true) {
        const ka = next_object_key_after(a, previous);
        const kb = next_object_key_after(b, previous);

        if (ka == null and kb == null) return .eq;
        if (ka == null) return .lt;
        if (kb == null) return .gt;

        const ko = std.mem.order(u8, ka.?, kb.?);
        if (ko != .eq) return ko;

        const va = a.get(ka.?) orelse unreachable;
        const vb = b.get(kb.?) orelse unreachable;

        const vo = tiebreak_compare_values(va, vb);
        if (vo != .eq) return vo;

        previous = ka.?;
    }
}
