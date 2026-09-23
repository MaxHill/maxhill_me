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

/// Converts an internal row to a user-facing row by
/// constructing an object of field values.
pub fn to_user_row(out: *UserRow, row: ORMapRow) !bool {
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

test "to_user_row" {
    const allocator = std.testing.allocator;

    var user_row = std.StringHashMap(std.json.Value).init(allocator);
    defer user_row.deinit();
    try user_row.ensureTotalCapacity(3); // name, age, and _key

    var fields = std.StringHashMap(LWWField).init(allocator);
    defer fields.deinit();

    const name_value = LWWField{
        .value = .{ .string = "max" },
        .dot = Dot{ .client_id = "client_1", .version = 0 },
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
