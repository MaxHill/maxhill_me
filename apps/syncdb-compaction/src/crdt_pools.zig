const std = @import("std");
const assert = std.debug.assert;
const crdt = @import("crdt.zig");

const Dot = crdt.Dot;
const Context = crdt.Context;
const ClientId = crdt.ClientId;
const Tombstone = crdt.Tombstone;
const JsonBytes = crdt.JsonBytes;
const SetRowFields = crdt.SetRowFields;
const ValidKey = crdt.ValidKey;
const CRDTOperation = crdt.CRDTOperation;
const LWWField = crdt.LWWField;
const ORMapRow = crdt.ORMapRow;

const pool_error = error{
    pool_exhausted,
};

pub const CRDTOperationPoolSlot = struct {
    pub const set_row_fields_capacity = 200;
    pub const tombstone_context_capacity = 200;
    pub const table_name_bytes_capacity = 64;
    pub const row_key_bytes_capacity = 256;
    pub const field_key_bytes_capacity = 8 * 1024;
    pub const value_bytes_capacity = 32 * 1024;

    table_name_storage: [table_name_bytes_capacity]u8 = undefined,
    table_name_len: usize = 0,
    row_key_storage: [row_key_bytes_capacity]u8 = undefined,
    row_key_len: usize = 0,
    field_key_storage: [field_key_bytes_capacity]u8 = undefined,
    field_key_len: usize = 0,
    value_storage: [value_bytes_capacity]u8 = undefined,
    value_len: usize = 0,

    operation: CRDTOperation,
    set_row_value: SetRowFields,
    active_operation: ?std.meta.Tag(CRDTOperation),
    next_free: ?i32,

    fn init(self: *@This()) !void {
        self.set_row_value = .{};

        self.table_name_len = 0;
        self.row_key_len = 0;
        self.field_key_len = 0;
        self.value_len = 0;
        self.operation = undefined;
        self.active_operation = null;
        self.next_free = null;
    }

    pub fn put_set_operation(
        self: *@This(),
        table: []const u8,
        row_key: []const u8,
        field: []const u8,
        value: JsonBytes,
        dot: Dot,
    ) !void {
        assert(self.active_operation == null);
        assert(self.field_key_len == 0);
        assert(self.value_len == 0);

        try self.put_table_name(table);
        try self.put_row_key(row_key);
        const stored_field = try self.copy_field_key(field);
        const stored_value = try self.copy_value(value);
        const stored_dot = try self.copy_dot(dot);

        self.operation = .{ .set = .{
            .table = self.table_name_storage[0..self.table_name_len],
            .row_key = self.row_key_storage[0..self.row_key_len],
            .field = stored_field,
            .value = stored_value,
            .dot = stored_dot,
        } };
        self.active_operation = .set;
    }

    pub fn put_set_row_operation(
        self: *@This(),
        table: []const u8,
        row_key: []const u8,
        dot: Dot,
    ) !void {
        assert(self.active_operation == null);
        assert(self.set_row_value.count == 0);

        try self.put_table_name(table);
        try self.put_row_key(row_key);
        const stored_dot = try self.copy_dot(dot);

        self.operation = .{ .set_row = .{
            .table = self.table_name_storage[0..self.table_name_len],
            .row_key = self.row_key_storage[0..self.row_key_len],
            .value = self.set_row_value,
            .dot = stored_dot,
        } };
        self.active_operation = .set_row;
    }

    pub fn put_set_row_field(
        self: *@This(),
        field: []const u8,
        value: JsonBytes,
    ) !void {
        assert(self.active_operation == .set_row);
        assert(self.set_row_value.count < set_row_fields_capacity);

        const stored_field = try self.copy_field_key(field);
        const stored_value = try self.copy_value(value);
        self.set_row_value.put(stored_field, stored_value);
        self.operation.set_row.value = self.set_row_value;
    }

    pub fn put_remove_operation(
        self: *@This(),
        table: []const u8,
        row_key: []const u8,
        tombstone: Tombstone,
    ) !void {
        assert(self.active_operation == null);
        tombstone.assert_valid();

        try self.put_table_name(table);
        try self.put_row_key(row_key);

        self.operation = .{ .remove = .{
            .table = self.table_name_storage[0..self.table_name_len],
            .row_key = self.row_key_storage[0..self.row_key_len],
            .tombstone = tombstone,
        } };
        self.active_operation = .remove;
    }

    fn put_table_name(self: *@This(), table_name: []const u8) !void {
        if (table_name.len > self.table_name_storage.len) return error.TableNameTooLong;

        @memcpy(self.table_name_storage[0..table_name.len], table_name);
        self.table_name_len = table_name.len;
    }

    fn put_row_key(self: *@This(), row_key: []const u8) !void {
        if (row_key.len > self.row_key_storage.len) return error.RowKeyTooLong;

        @memcpy(self.row_key_storage[0..row_key.len], row_key);
        self.row_key_len = row_key.len;
    }

    fn copy_field_key(self: *@This(), field: []const u8) ![]const u8 {
        assert(field.len > 0);
        if (self.field_key_len + field.len > self.field_key_storage.len) {
            return error.FieldKeyStorageTooSmall;
        }

        const start = self.field_key_len;
        self.field_key_len += field.len;
        @memcpy(self.field_key_storage[start..self.field_key_len], field);
        return self.field_key_storage[start..self.field_key_len];
    }

    fn copy_value(self: *@This(), value: JsonBytes) !JsonBytes {
        if (self.value_len + value.len > self.value_storage.len) {
            return error.ValueStorageTooSmall;
        }

        const start = self.value_len;
        self.value_len += value.len;
        @memcpy(self.value_storage[start..self.value_len], value);
        return self.value_storage[start..self.value_len];
    }

    fn copy_dot(self: *@This(), dot: Dot) !Dot {
        _ = self;
        return dot;
    }

    fn reset(self: *@This()) void {
        if (self.active_operation) |tag| {
            switch (tag) {
                .set => {},
                .set_row => {},
                .remove => {},
            }
        }

        self.set_row_value = .{};
        self.table_name_len = 0;
        self.row_key_len = 0;
        self.field_key_len = 0;
        self.value_len = 0;
        self.operation = undefined;
        self.active_operation = null;
        self.next_free = null;
    }
};
pub const CRDTOperationPool = struct {
    allocator: std.mem.Allocator,
    slots: []CRDTOperationPoolSlot,
    free_head: ?i32,

    pub fn init(allocator: std.mem.Allocator, capacity: i32) !@This() {
        assert(capacity > 0);
        assert(capacity < std.math.maxInt(i32));

        const slots = try allocator.alloc(
            CRDTOperationPoolSlot,
            @intCast(capacity),
        );
        errdefer allocator.free(slots);

        var previous: ?i32 = null;
        for (slots, 0..) |*slot, index| {
            assert(index < @as(usize, @intCast(capacity)));

            try slot.init();
            slot.next_free = previous;
            previous = @intCast(index);
        }

        return .{
            .allocator = allocator,
            .slots = slots,
            .free_head = previous,
        };
    }

    pub fn deinit(self: *@This()) void {
        self.allocator.free(self.slots);
    }

    pub fn acquire(self: *@This()) !*CRDTOperationPoolSlot {
        const index = self.free_head orelse {
            return pool_error.pool_exhausted;
        };

        const slot = &self.slots[@intCast(index)];
        self.free_head = slot.next_free;
        slot.next_free = null;

        return slot;
    }
    pub fn release(
        self: *@This(),
        slot: *CRDTOperationPoolSlot,
    ) void {
        const index = self.indexOf(slot);

        slot.reset();

        slot.next_free = self.free_head;
        self.free_head = index;
    }

    fn indexOf(
        self: *@This(),
        slot: *CRDTOperationPoolSlot,
    ) i32 {
        const pool_start = @intFromPtr(self.slots.ptr);
        const slot_address = @intFromPtr(slot);
        const offset = slot_address - pool_start;

        return @intCast(offset / @sizeOf(CRDTOperationPoolSlot));
    }
};

pub const ORMapRowPoolSlot = struct {
    pub const fields_capacity = 200;
    pub const tombstone_context_capacity = 200;
    pub const table_name_bytes_capacity = 64;
    pub const row_key_bytes_capacity = 256;
    pub const field_key_bytes_capacity = 8 * 1024;
    pub const value_bytes_capacity = 32 * 1024;

    table_name_storage: [table_name_bytes_capacity]u8 = undefined,
    table_name_len: usize = 0,
    row_key_storage: [row_key_bytes_capacity]u8 = undefined,
    row_key_len: usize = 0,
    field_key_storage: [field_key_bytes_capacity]u8 = undefined,
    field_key_len: usize = 0,
    value_storage: [value_bytes_capacity]u8 = undefined,
    value_len: usize = 0,

    operation: ORMapRow,
    next_free: ?i32,

    fn init(self: *@This()) !void {
        const fields = crdt.ORMapRowFields{};

        self.table_name_len = 0;
        self.row_key_len = 0;
        self.field_key_len = 0;
        self.value_len = 0;
        self.operation = .{
            .table_name = self.table_name_storage[0..0],
            .row_key = self.row_key_storage[0..0],
            .fields = fields,
            .tombstone = .{ .dot = null, .context = .{} },
        };
        self.next_free = null;
    }

    pub fn put_row(
        self: *@This(),
        table_name: []const u8,
        row_key: ValidKey,
    ) !void {
        self.reset();
        try self.put_table_name(table_name);
        try self.put_row_key(row_key);
    }

    fn put_table_name(self: *@This(), table_name: []const u8) !void {
        if (table_name.len > self.table_name_storage.len) return error.TableNameTooLong;

        @memcpy(self.table_name_storage[0..table_name.len], table_name);
        self.table_name_len = table_name.len;
        self.operation.table_name = self.table_name_storage[0..self.table_name_len];
    }

    fn put_row_key(self: *@This(), row_key: []const u8) !void {
        if (row_key.len > self.row_key_storage.len) return error.RowKeyTooLong;

        @memcpy(self.row_key_storage[0..row_key.len], row_key);
        self.row_key_len = row_key.len;
        self.operation.row_key = self.row_key_storage[0..self.row_key_len];
    }

    pub fn put_field(
        self: *@This(),
        field: []const u8,
        value: JsonBytes,
        dot: Dot,
    ) !void {
        assert(self.operation.table_name.len > 0);
        assert(self.operation.row_key.len > 0);
        assert(self.operation.fields.count < fields_capacity);

        const stored_field = try self.copy_field_key(field);
        const stored_value = try self.copy_value(value);
        self.operation.fields.put(stored_field, stored_value, dot);
    }

    pub fn put_tombstone(self: *@This(), dot: Dot) void {
        assert(!self.operation.tombstone.active());
        assert(self.operation.tombstone.context.count == 0);

        self.operation.tombstone.dot = dot;
    }

    fn copy_field_key(self: *@This(), field: []const u8) ![]const u8 {
        assert(field.len > 0);
        if (self.field_key_len + field.len > self.field_key_storage.len) {
            return error.FieldKeyStorageTooSmall;
        }

        const start = self.field_key_len;
        self.field_key_len += field.len;
        @memcpy(self.field_key_storage[start..self.field_key_len], field);
        return self.field_key_storage[start..self.field_key_len];
    }

    fn copy_value(self: *@This(), value: JsonBytes) !JsonBytes {
        if (self.value_len + value.len > self.value_storage.len) {
            return error.ValueStorageTooSmall;
        }

        const start = self.value_len;
        self.value_len += value.len;
        @memcpy(self.value_storage[start..self.value_len], value);
        return self.value_storage[start..self.value_len];
    }

    fn reset(self: *@This()) void {
        var fields = self.operation.fields;
        fields.clear();

        var tombstone = self.operation.tombstone;
        tombstone.dot = null;
        tombstone.context = .{};

        self.table_name_len = 0;
        self.row_key_len = 0;
        self.field_key_len = 0;
        self.value_len = 0;
        self.operation = .{
            .table_name = self.table_name_storage[0..0],
            .row_key = self.row_key_storage[0..0],
            .fields = fields,
            .tombstone = tombstone,
        };
        self.next_free = null;
    }
};
pub const ORMapRowPool = struct {
    allocator: std.mem.Allocator,
    slots: []ORMapRowPoolSlot,
    free_head: ?i32,

    pub fn init(allocator: std.mem.Allocator, capacity: i32) !@This() {
        assert(capacity > 0);
        assert(capacity < std.math.maxInt(i32));

        const slots = try allocator.alloc(
            ORMapRowPoolSlot,
            @intCast(capacity),
        );
        errdefer allocator.free(slots);

        var previous: ?i32 = null;
        for (slots, 0..) |*slot, index| {
            assert(index < @as(usize, @intCast(capacity)));

            try slot.init();
            slot.next_free = previous;
            previous = @intCast(index);
        }

        return .{
            .allocator = allocator,
            .slots = slots,
            .free_head = previous,
        };
    }

    pub fn deinit(self: *@This()) void {
        self.allocator.free(self.slots);
    }

    pub fn acquire(self: *@This()) !*ORMapRowPoolSlot {
        const index = self.free_head orelse {
            return pool_error.pool_exhausted;
        };

        const slot = &self.slots[@intCast(index)];
        self.free_head = slot.next_free;
        slot.next_free = null;

        return slot;
    }
    pub fn release(
        self: *@This(),
        slot: *ORMapRowPoolSlot,
    ) void {
        const index = self.indexOf(slot);

        slot.reset();

        slot.next_free = self.free_head;
        self.free_head = index;
    }

    fn indexOf(
        self: *@This(),
        slot: *ORMapRowPoolSlot,
    ) i32 {
        const pool_start = @intFromPtr(self.slots.ptr);
        const slot_address = @intFromPtr(slot);
        const offset = slot_address - pool_start;

        return @intCast(offset / @sizeOf(ORMapRowPoolSlot));
    }
};

fn assert_pool_constants_valid() void {
    assert(CRDTOperationPoolSlot.set_row_fields_capacity > 0);
    assert(CRDTOperationPoolSlot.tombstone_context_capacity > 0);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.value_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.set_row_fields_capacity <= 200);
    assert(CRDTOperationPoolSlot.tombstone_context_capacity <= 200);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity <= 1024);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity <= 1024);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity >= 1024);
    assert(CRDTOperationPoolSlot.value_bytes_capacity >= 1024);
    assert(ORMapRowPoolSlot.fields_capacity > 0);
    assert(ORMapRowPoolSlot.tombstone_context_capacity > 0);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.field_key_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.value_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.fields_capacity <= 200);
    assert(ORMapRowPoolSlot.tombstone_context_capacity <= 200);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity <= 1024);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity <= 1024);
    assert(ORMapRowPoolSlot.field_key_bytes_capacity >= 1024);
    assert(ORMapRowPoolSlot.value_bytes_capacity >= 1024);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity == ORMapRowPoolSlot.table_name_bytes_capacity);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity == ORMapRowPoolSlot.row_key_bytes_capacity);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity == ORMapRowPoolSlot.field_key_bytes_capacity);
    assert(CRDTOperationPoolSlot.value_bytes_capacity == ORMapRowPoolSlot.value_bytes_capacity);
    assert(CRDTOperationPoolSlot.tombstone_context_capacity == ORMapRowPoolSlot.tombstone_context_capacity);
    assert(CRDTOperationPoolSlot.set_row_fields_capacity == ORMapRowPoolSlot.fields_capacity);
    assert(@sizeOf(CRDTOperationPoolSlot) > @sizeOf(CRDTOperation));
    assert(@sizeOf(ORMapRowPoolSlot) > @sizeOf(ORMapRow));
    assert(@sizeOf(ClientId) == 16);
    assert(@sizeOf(Context) > @sizeOf(ClientId));
    assert(@sizeOf(Dot) >= @sizeOf(ClientId));
    assert(@sizeOf(ValidKey) == @sizeOf([]const u8));
    assert(@sizeOf(LWWField) >= @sizeOf(Dot));
}

fn assert_pool_exact_constants_valid() void {
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity >= 16);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity >= 16);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity >= 16);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity >= 16);
    assert(CRDTOperationPoolSlot.set_row_fields_capacity == 200);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity == 64);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity == 256);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity == 8 * 1024);
    assert(CRDTOperationPoolSlot.value_bytes_capacity == 32 * 1024);
    assert(ORMapRowPoolSlot.fields_capacity == 200);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity == 64);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity == 256);
    assert(ORMapRowPoolSlot.field_key_bytes_capacity == 8 * 1024);
    assert(ORMapRowPoolSlot.value_bytes_capacity == 32 * 1024);
    assert(CRDTOperationPoolSlot.set_row_fields_capacity == CRDTOperationPoolSlot.tombstone_context_capacity);
    assert(ORMapRowPoolSlot.fields_capacity == ORMapRowPoolSlot.tombstone_context_capacity);
    assert(@sizeOf(CRDTOperationPoolSlot) < 64 * 1024);
    assert(@sizeOf(ORMapRowPoolSlot) < 64 * 1024);
    assert(CRDTOperationPoolSlot.tombstone_context_capacity == 200);
    assert(ORMapRowPoolSlot.tombstone_context_capacity == 200);
}

fn test_client_id(bytes: []const u8) ClientId {
    assert(bytes.len <= @sizeOf(ClientId));

    var id = [_]u8{0} ** @sizeOf(ClientId);
    @memcpy(id[0..bytes.len], bytes);
    return id;
}

test "pools initialize preallocated slots" {
    assert_pool_constants_valid();
    assert_pool_exact_constants_valid();

    const allocator = std.testing.allocator;

    var operation_pool = try CRDTOperationPool.init(allocator, 2);
    defer operation_pool.deinit();
    const operation_slot = try operation_pool.acquire();
    try std.testing.expectEqual(@as(usize, 0), operation_slot.set_row_value.count);
    try std.testing.expect(operation_slot.active_operation == null);
    operation_pool.release(operation_slot);

    var row_pool = try ORMapRowPool.init(allocator, 2);
    defer row_pool.deinit();
    const row_slot = try row_pool.acquire();
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.fields.count);
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.tombstone.context.count);
    row_pool.release(row_slot);
}

test "pool slots reserve operation storage" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();
    try operation_slot.put_set_row_operation("table", "row", .{ .client_id = test_client_id("client"), .version = 1 });
    try std.testing.expectEqual(@as(usize, 0), operation_slot.operation.set_row.value.count);

    operation_slot.reset();
    try operation_slot.put_remove_operation("table", "row", .{
        .dot = .{ .client_id = test_client_id("client"), .version = 1 },
        .context = .{},
    });
    try std.testing.expectEqual(@as(usize, 0), operation_slot.operation.remove.tombstone.context.count);

    var row_slot: ORMapRowPoolSlot = undefined;
    try row_slot.init();
    try row_slot.put_row("table", "row");
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.fields.count);
    row_slot.put_tombstone(.{ .client_id = test_client_id("client"), .version = 1 });
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.tombstone.context.count);
}

test "operation slot copies operation identity strings" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();

    var table_name_buffer = [_]u8{ 't', 'a', 'b', 'l', 'e' };
    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };
    var client_id_buffer = test_client_id("client");
    const expected_client_id = client_id_buffer;

    var field_buffer = [_]u8{ 't', 'i', 't', 'l', 'e' };
    var value_buffer = [_]u8{ '"', 'o', 'n', 'e', '"' };

    try operation_slot.put_set_row_operation(
        table_name_buffer[0..],
        row_key_buffer[0..],
        .{ .client_id = client_id_buffer, .version = 1 },
    );
    try operation_slot.put_set_row_field(field_buffer[0..], value_buffer[0..]);

    @memset(field_buffer[0..], 'f');
    @memset(value_buffer[0..], 'v');
    @memset(table_name_buffer[0..], 'x');
    @memset(row_key_buffer[0..], 'y');
    @memset(&client_id_buffer, 'z');

    try std.testing.expectEqualStrings("table", operation_slot.operation.set_row.table);
    try std.testing.expectEqualStrings("row-1", operation_slot.operation.set_row.row_key);
    try std.testing.expectEqualStrings(
        "\"one\"",
        operation_slot.operation.set_row.value.get("title").?,
    );
    try std.testing.expectEqualSlices(u8, &expected_client_id, &operation_slot.operation.set_row.dot.client_id);
}

test "operation slot copies set field and value strings" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();

    var field_buffer = [_]u8{ 'n', 'a', 'm', 'e' };
    var value_buffer = [_]u8{ '"', 'm', 'a', 'x', '"' };

    try operation_slot.put_set_operation(
        "table",
        "row",
        field_buffer[0..],
        value_buffer[0..],
        .{ .client_id = test_client_id("client"), .version = 1 },
    );

    @memset(field_buffer[0..], 'f');
    @memset(value_buffer[0..], 'v');

    try std.testing.expectEqualStrings("name", operation_slot.operation.set.field.?);
    try std.testing.expectEqualStrings("\"max\"", operation_slot.operation.set.value);
}

test "row slot copies row identity strings" {
    var row_slot: ORMapRowPoolSlot = undefined;
    try row_slot.init();

    var table_name_buffer = [_]u8{ 't', 'a', 'b', 'l', 'e' };
    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };

    var field_buffer = [_]u8{ 'a', 'g', 'e' };
    var value_buffer = [_]u8{ '3', '1' };

    try row_slot.put_row(table_name_buffer[0..], row_key_buffer[0..]);
    try row_slot.put_field(
        field_buffer[0..],
        value_buffer[0..],
        .{ .client_id = test_client_id("client"), .version = 1 },
    );

    @memset(field_buffer[0..], 'f');
    @memset(value_buffer[0..], 'v');
    @memset(table_name_buffer[0..], 'x');
    @memset(row_key_buffer[0..], 'y');

    try std.testing.expectEqualStrings("table", row_slot.operation.table_name);
    try std.testing.expectEqualStrings("row-1", row_slot.operation.row_key);
    try std.testing.expectEqualStrings("31", row_slot.operation.fields.get("age").?.value);
}
