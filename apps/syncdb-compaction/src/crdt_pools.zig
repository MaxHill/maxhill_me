const std = @import("std");
const assert = std.debug.assert;
const crdt = @import("crdt.zig");

const PoolError = error{
    PoolExhausted,
};

const PoolSlotState = union(enum) {
    acquired,
    free_list_end,
    next_free: i32,
};

pub const CRDTOperationPoolSlot = struct {
    pub const set_row_fields_count_max = 200;
    pub const tombstone_version_vector_entries_count_max = 200;
    pub const table_name_bytes_capacity = 64;
    pub const row_key_bytes_capacity = 256;
    pub const field_key_bytes_capacity = 8 * 1024;
    pub const json_value_bytes_capacity = 32 * 1024;

    table_name_storage: [table_name_bytes_capacity]u8 = undefined,
    table_name_bytes_count: usize = 0,

    row_key_storage: [row_key_bytes_capacity]u8 = undefined,
    row_key_bytes_count: usize = 0,

    field_key_storage: [field_key_bytes_capacity]u8 = undefined,
    field_key_bytes_count: usize = 0,

    json_value_storage: [json_value_bytes_capacity]u8 = undefined,
    json_value_bytes_count: usize = 0,

    operation: crdt.CRDTOperation,
    set_row_fields: crdt.SetRowOperationFields,
    active_operation: ?std.meta.Tag(crdt.CRDTOperation),
    pool_state: PoolSlotState,

    fn init(self: *@This()) !void {
        self.set_row_fields = .{};

        self.table_name_bytes_count = 0;
        self.row_key_bytes_count = 0;
        self.field_key_bytes_count = 0;
        self.json_value_bytes_count = 0;
        self.operation = undefined;
        self.active_operation = null;
        self.pool_state = .acquired;
    }

    pub fn put_set_row_operation(
        self: *@This(),
        table: []const u8,
        row_key: []const u8,
        dot: crdt.Dot,
    ) !void {
        assert(self.active_operation == null);
        assert(self.set_row_fields.count == 0);

        try self.put_table_name(table);
        try self.put_row_key(row_key);
        const stored_dot = try self.copy_dot(dot);

        self.operation = .{ .set_row = .{
            .table_name = self.table_name_storage[0..self.table_name_bytes_count],
            .row_key = self.row_key_storage[0..self.row_key_bytes_count],
            .fields = self.set_row_fields,
            .dot = stored_dot,
        } };
        self.active_operation = .set_row;
    }

    pub fn put_set_row_field(
        self: *@This(),
        field_key: []const u8,
        json_value: crdt.JsonValueBytes,
    ) !void {
        assert(self.active_operation == .set_row);
        assert(self.set_row_fields.count < set_row_fields_count_max);

        const stored_field_key = try self.copy_field_key(field_key);
        const stored_json_value = try self.copy_json_value(json_value);
        self.set_row_fields.put(stored_field_key, stored_json_value);
        self.operation.set_row.fields = self.set_row_fields;
    }

    pub fn put_remove_row_operation(
        self: *@This(),
        table: []const u8,
        row_key: []const u8,
        tombstone: crdt.Tombstone,
    ) !void {
        assert(self.active_operation == null);
        tombstone.assert_valid();

        try self.put_table_name(table);
        try self.put_row_key(row_key);

        self.operation = .{ .remove_row = .{
            .table_name = self.table_name_storage[0..self.table_name_bytes_count],
            .row_key = self.row_key_storage[0..self.row_key_bytes_count],
            .tombstone = tombstone,
        } };
        self.active_operation = .remove_row;
    }

    fn put_table_name(self: *@This(), table_name: []const u8) !void {
        if (table_name.len > self.table_name_storage.len) return error.TableNameTooLong;

        @memcpy(self.table_name_storage[0..table_name.len], table_name);
        self.table_name_bytes_count = table_name.len;
    }

    fn put_row_key(self: *@This(), row_key: []const u8) !void {
        if (row_key.len > self.row_key_storage.len) return error.RowKeyTooLong;

        @memcpy(self.row_key_storage[0..row_key.len], row_key);
        self.row_key_bytes_count = row_key.len;
    }

    fn copy_field_key(self: *@This(), field_key: []const u8) ![]const u8 {
        assert(field_key.len > 0);
        if (self.field_key_bytes_count + field_key.len > self.field_key_storage.len) {
            return error.FieldKeyStorageTooSmall;
        }

        const start = self.field_key_bytes_count;
        self.field_key_bytes_count += field_key.len;
        @memcpy(self.field_key_storage[start..self.field_key_bytes_count], field_key);
        return self.field_key_storage[start..self.field_key_bytes_count];
    }

    fn copy_json_value(self: *@This(), json_value: crdt.JsonValueBytes) !crdt.JsonValueBytes {
        if (self.json_value_bytes_count + json_value.len > self.json_value_storage.len) {
            return error.ValueStorageTooSmall;
        }

        const start = self.json_value_bytes_count;
        self.json_value_bytes_count += json_value.len;
        @memcpy(self.json_value_storage[start..self.json_value_bytes_count], json_value);
        return self.json_value_storage[start..self.json_value_bytes_count];
    }

    fn copy_dot(self: *@This(), dot: crdt.Dot) !crdt.Dot {
        _ = self;
        return dot;
    }

    fn reset(self: *@This()) void {
        if (self.active_operation) |tag| {
            switch (tag) {
                .set_row => {},
                .remove_row => {},
            }
        }

        self.set_row_fields = .{};
        self.table_name_bytes_count = 0;
        self.row_key_bytes_count = 0;
        self.field_key_bytes_count = 0;
        self.json_value_bytes_count = 0;
        self.operation = undefined;
        self.active_operation = null;
        self.pool_state = .acquired;
    }
};

pub const ORMapRowPoolSlot = struct {
    pub const row_field_registers_count_max = 200;
    pub const tombstone_version_vector_entries_count_max = 200;

    pub const table_name_bytes_capacity = 64;
    pub const row_key_bytes_capacity = 256;
    pub const field_key_bytes_capacity = 8 * 1024;
    pub const json_value_bytes_capacity = 32 * 1024;

    table_name_storage: [table_name_bytes_capacity]u8 = undefined,
    table_name_bytes_count: usize = 0,

    row_key_storage: [row_key_bytes_capacity]u8 = undefined,
    row_key_bytes_count: usize = 0,

    field_key_storage: [field_key_bytes_capacity]u8 = undefined,
    field_key_bytes_count: usize = 0,

    json_value_storage: [json_value_bytes_capacity]u8 = undefined,
    json_value_bytes_count: usize = 0,

    row: crdt.ORMapRow,
    pool_state: PoolSlotState,

    fn init(self: *@This()) !void {
        const fields = crdt.RowFieldRegisters{};

        self.table_name_bytes_count = 0;
        self.row_key_bytes_count = 0;
        self.field_key_bytes_count = 0;
        self.json_value_bytes_count = 0;
        self.row = .{
            .table_name = self.table_name_storage[0..0],
            .row_key = self.row_key_storage[0..0],
            .fields = fields,
            .tombstone = .{ .dot = null, .version_vector = .{} },
        };
        self.pool_state = .acquired;
    }

    pub fn put_row(
        self: *@This(),
        table_name: []const u8,
        row_key: crdt.RowKey,
    ) !void {
        self.reset();
        try self.put_table_name(table_name);
        try self.put_row_key(row_key);
    }

    fn put_table_name(self: *@This(), table_name: []const u8) !void {
        if (table_name.len > self.table_name_storage.len) return error.TableNameTooLong;

        @memcpy(self.table_name_storage[0..table_name.len], table_name);
        self.table_name_bytes_count = table_name.len;
        self.row.table_name = self.table_name_storage[0..self.table_name_bytes_count];
    }

    fn put_row_key(self: *@This(), row_key: []const u8) !void {
        if (row_key.len > self.row_key_storage.len) return error.RowKeyTooLong;

        @memcpy(self.row_key_storage[0..row_key.len], row_key);
        self.row_key_bytes_count = row_key.len;
        self.row.row_key = self.row_key_storage[0..self.row_key_bytes_count];
    }

    pub fn put_field(
        self: *@This(),
        field_key: []const u8,
        json_value: crdt.JsonValueBytes,
        dot: crdt.Dot,
    ) !void {
        assert(self.row.table_name.len > 0);
        assert(self.row.row_key.len > 0);
        assert(self.row.fields.count < row_field_registers_count_max);

        const stored_field_key = try self.copy_field_key(field_key);
        const stored_json_value = try self.copy_json_value(json_value);
        self.row.fields.put(stored_field_key, stored_json_value, dot);
    }

    pub fn put_tombstone_dot(self: *@This(), dot: crdt.Dot) void {
        assert(!self.row.tombstone.is_active());
        assert(self.row.tombstone.version_vector.count == 0);

        self.row.tombstone.dot = dot;
    }

    fn copy_field_key(self: *@This(), field_key: []const u8) ![]const u8 {
        assert(field_key.len > 0);
        if (self.field_key_bytes_count + field_key.len > self.field_key_storage.len) {
            return error.FieldKeyStorageTooSmall;
        }

        const start = self.field_key_bytes_count;
        self.field_key_bytes_count += field_key.len;
        @memcpy(self.field_key_storage[start..self.field_key_bytes_count], field_key);
        return self.field_key_storage[start..self.field_key_bytes_count];
    }

    fn copy_json_value(self: *@This(), json_value: crdt.JsonValueBytes) !crdt.JsonValueBytes {
        if (self.json_value_bytes_count + json_value.len > self.json_value_storage.len) {
            return error.ValueStorageTooSmall;
        }

        const start = self.json_value_bytes_count;
        self.json_value_bytes_count += json_value.len;
        @memcpy(self.json_value_storage[start..self.json_value_bytes_count], json_value);
        return self.json_value_storage[start..self.json_value_bytes_count];
    }

    fn reset(self: *@This()) void {
        var fields = self.row.fields;
        fields.clear();

        var tombstone = self.row.tombstone;
        tombstone.dot = null;
        tombstone.version_vector = .{};

        self.table_name_bytes_count = 0;
        self.row_key_bytes_count = 0;
        self.field_key_bytes_count = 0;
        self.json_value_bytes_count = 0;
        self.row = .{
            .table_name = self.table_name_storage[0..0],
            .row_key = self.row_key_storage[0..0],
            .fields = fields,
            .tombstone = tombstone,
        };
        self.pool_state = .acquired;
    }
};

pub const CRDTOperationPool = slot_pool(CRDTOperationPoolSlot);
pub const ORMapRowPool = slot_pool(ORMapRowPoolSlot);

fn slot_pool(comptime Slot: type) type {
    return struct {
        allocator: std.mem.Allocator,
        slots: []Slot,
        free_head_index: ?i32,

        pub fn init(allocator: std.mem.Allocator, slot_count: i32) !@This() {
            assert(slot_count > 0);
            assert(slot_count < std.math.maxInt(i32));

            const slots = try allocator.alloc(
                Slot,
                @intCast(slot_count),
            );
            errdefer allocator.free(slots);

            var previous_index: ?i32 = null;
            for (slots, 0..) |*slot, index| {
                assert(index < @as(usize, @intCast(slot_count)));

                try slot.init();
                slot.pool_state = if (previous_index) |next_free|
                    .{ .next_free = next_free }
                else
                    .free_list_end;
                previous_index = @intCast(index);
            }

            return .{
                .allocator = allocator,
                .slots = slots,
                .free_head_index = previous_index,
            };
        }

        pub fn deinit(self: *@This()) void {
            self.allocator.free(self.slots);
        }

        pub fn acquire(self: *@This()) !*Slot {
            const index = self.free_head_index orelse {
                return PoolError.PoolExhausted;
            };

            const slot = &self.slots[@intCast(index)];
            self.free_head_index = switch (slot.pool_state) {
                .next_free => |next_free| next_free,
                .free_list_end => null,
                .acquired => unreachable,
            };
            slot.pool_state = .acquired;

            return slot;
        }
        pub fn release(self: *@This(), slot: *Slot) void {
            const index = self.index_of(slot);
            assert(slot.pool_state == .acquired);

            slot.reset();
            slot.pool_state = if (self.free_head_index) |next_free|
                .{ .next_free = next_free }
            else
                .free_list_end;
            self.free_head_index = index;
        }

        fn index_of(self: *@This(), slot: *Slot) i32 {
            const pool_start_address = @intFromPtr(self.slots.ptr);
            const pool_end_address = pool_start_address + self.slots.len * @sizeOf(Slot);
            const slot_address = @intFromPtr(slot);

            assert(slot_address >= pool_start_address);
            assert(slot_address < pool_end_address);

            const offset_bytes = slot_address - pool_start_address;
            assert(offset_bytes % @sizeOf(Slot) == 0);

            return @intCast(offset_bytes / @sizeOf(Slot));
        }
    };
}

//  ------------------------------------------------------------------
//  Assert helpers
//  ------------------------------------------------------------------
comptime {
    assert(CRDTOperationPoolSlot.set_row_fields_count_max > 0);
    assert(CRDTOperationPoolSlot.tombstone_version_vector_entries_count_max > 0);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.json_value_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.set_row_fields_count_max <= 200);
    assert(CRDTOperationPoolSlot.tombstone_version_vector_entries_count_max <= 200);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity <= 1024);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity <= 1024);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity >= 1024);
    assert(CRDTOperationPoolSlot.json_value_bytes_capacity >= 1024);
    assert(ORMapRowPoolSlot.row_field_registers_count_max > 0);
    assert(ORMapRowPoolSlot.tombstone_version_vector_entries_count_max > 0);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.field_key_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.json_value_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.row_field_registers_count_max <= 200);
    assert(ORMapRowPoolSlot.tombstone_version_vector_entries_count_max <= 200);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity <= 1024);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity <= 1024);
    assert(ORMapRowPoolSlot.field_key_bytes_capacity >= 1024);
    assert(ORMapRowPoolSlot.json_value_bytes_capacity >= 1024);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity == ORMapRowPoolSlot.table_name_bytes_capacity);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity == ORMapRowPoolSlot.row_key_bytes_capacity);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity == ORMapRowPoolSlot.field_key_bytes_capacity);
    assert(CRDTOperationPoolSlot.json_value_bytes_capacity == ORMapRowPoolSlot.json_value_bytes_capacity);
    assert(CRDTOperationPoolSlot.tombstone_version_vector_entries_count_max == ORMapRowPoolSlot.tombstone_version_vector_entries_count_max);
    assert(CRDTOperationPoolSlot.set_row_fields_count_max == ORMapRowPoolSlot.row_field_registers_count_max);
    assert(@sizeOf(CRDTOperationPoolSlot) > @sizeOf(crdt.CRDTOperation));
    assert(@sizeOf(ORMapRowPoolSlot) > @sizeOf(crdt.ORMapRow));

    // assert_pool_exact_constants_valid
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity >= 16);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity >= 16);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity >= 16);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity >= 16);
    assert(CRDTOperationPoolSlot.set_row_fields_count_max == 200);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity == 64);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity == 256);
    assert(CRDTOperationPoolSlot.field_key_bytes_capacity == 8 * 1024);
    assert(CRDTOperationPoolSlot.json_value_bytes_capacity == 32 * 1024);
    assert(ORMapRowPoolSlot.row_field_registers_count_max == 200);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity == 64);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity == 256);
    assert(ORMapRowPoolSlot.field_key_bytes_capacity == 8 * 1024);
    assert(ORMapRowPoolSlot.json_value_bytes_capacity == 32 * 1024);
    assert(CRDTOperationPoolSlot.set_row_fields_count_max == CRDTOperationPoolSlot.tombstone_version_vector_entries_count_max);
    assert(ORMapRowPoolSlot.row_field_registers_count_max == ORMapRowPoolSlot.tombstone_version_vector_entries_count_max);
    assert(@sizeOf(CRDTOperationPoolSlot) < 64 * 1024);
    assert(@sizeOf(ORMapRowPoolSlot) < 64 * 1024);
    assert(CRDTOperationPoolSlot.tombstone_version_vector_entries_count_max == 200);
    assert(ORMapRowPoolSlot.tombstone_version_vector_entries_count_max == 200);
}

//  ------------------------------------------------------------------
//  Tests
//  ------------------------------------------------------------------
fn test_client_id(client_id_bytes: []const u8) crdt.ClientId {
    assert(client_id_bytes.len <= @sizeOf(crdt.ClientId));

    var client_id = [_]u8{0} ** @sizeOf(crdt.ClientId);
    @memcpy(client_id[0..client_id_bytes.len], client_id_bytes);
    return client_id;
}

test "pools initialize preallocated slots" {
    const allocator = std.testing.allocator;

    var operation_pool = try CRDTOperationPool.init(allocator, 2);
    defer operation_pool.deinit();
    const operation_slot = try operation_pool.acquire();
    try std.testing.expectEqual(@as(usize, 0), operation_slot.set_row_fields.count);
    try std.testing.expect(operation_slot.active_operation == null);
    operation_pool.release(operation_slot);

    var row_pool = try ORMapRowPool.init(allocator, 2);
    defer row_pool.deinit();
    const row_slot = try row_pool.acquire();
    try std.testing.expectEqual(@as(usize, 0), row_slot.row.fields.count);
    try std.testing.expectEqual(@as(usize, 0), row_slot.row.tombstone.version_vector.count);
    row_pool.release(row_slot);
}

test "operation pool marks acquired and free slots explicitly" {
    const allocator = std.testing.allocator;

    var operation_pool = try CRDTOperationPool.init(allocator, 2);
    defer operation_pool.deinit();

    const first_slot = try operation_pool.acquire();
    const second_slot = try operation_pool.acquire();
    try std.testing.expect(first_slot.pool_state == .acquired);
    try std.testing.expect(second_slot.pool_state == .acquired);
    try std.testing.expect(first_slot != second_slot);

    operation_pool.release(first_slot);
    try std.testing.expect(first_slot.pool_state == .free_list_end);
}

test "row pool marks acquired and free slots explicitly" {
    const allocator = std.testing.allocator;

    var row_pool = try ORMapRowPool.init(allocator, 2);
    defer row_pool.deinit();

    const first_slot = try row_pool.acquire();
    const second_slot = try row_pool.acquire();
    try std.testing.expect(first_slot.pool_state == .acquired);
    try std.testing.expect(second_slot.pool_state == .acquired);
    try std.testing.expect(first_slot != second_slot);

    row_pool.release(first_slot);
    try std.testing.expect(first_slot.pool_state == .free_list_end);
}

test "pool slots reserve operation storage" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();
    try operation_slot.put_set_row_operation("table", "row", .{ .client_id = test_client_id("client"), .version = 1 });
    try std.testing.expectEqual(@as(usize, 0), operation_slot.operation.set_row.fields.count);

    operation_slot.reset();
    try operation_slot.put_remove_row_operation("table", "row", .{
        .dot = .{ .client_id = test_client_id("client"), .version = 1 },
        .version_vector = .{},
    });
    try std.testing.expectEqual(@as(usize, 0), operation_slot.operation.remove_row.tombstone.version_vector.count);

    var row_slot: ORMapRowPoolSlot = undefined;
    try row_slot.init();
    try row_slot.put_row("table", "row");
    try std.testing.expectEqual(@as(usize, 0), row_slot.row.fields.count);
    row_slot.put_tombstone_dot(.{ .client_id = test_client_id("client"), .version = 1 });
    try std.testing.expectEqual(@as(usize, 0), row_slot.row.tombstone.version_vector.count);
}

test "operation slot copies operation identity strings" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();

    var table_name_buffer = [_]u8{ 't', 'a', 'b', 'l', 'e' };
    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };
    var client_id_buffer = test_client_id("client");
    const expected_client_id = client_id_buffer;

    var field_key_buffer = [_]u8{ 't', 'i', 't', 'l', 'e' };
    var json_value_buffer = [_]u8{ '"', 'o', 'n', 'e', '"' };

    try operation_slot.put_set_row_operation(
        table_name_buffer[0..],
        row_key_buffer[0..],
        .{ .client_id = client_id_buffer, .version = 1 },
    );
    try operation_slot.put_set_row_field(field_key_buffer[0..], json_value_buffer[0..]);

    @memset(field_key_buffer[0..], 'f');
    @memset(json_value_buffer[0..], 'v');
    @memset(table_name_buffer[0..], 'x');
    @memset(row_key_buffer[0..], 'y');
    @memset(&client_id_buffer, 'z');

    try std.testing.expectEqualStrings("table", operation_slot.operation.set_row.table_name);
    try std.testing.expectEqualStrings("row-1", operation_slot.operation.set_row.row_key);
    try std.testing.expectEqualStrings(
        "\"one\"",
        operation_slot.operation.set_row.fields.get("title").?,
    );
    try std.testing.expectEqualSlices(u8, &expected_client_id, &operation_slot.operation.set_row.dot.client_id);
}

test "row slot copies row identity strings" {
    var row_slot: ORMapRowPoolSlot = undefined;
    try row_slot.init();

    var table_name_buffer = [_]u8{ 't', 'a', 'b', 'l', 'e' };
    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };

    var field_key_buffer = [_]u8{ 'a', 'g', 'e' };
    var json_value_buffer = [_]u8{ '3', '1' };

    try row_slot.put_row(table_name_buffer[0..], row_key_buffer[0..]);
    try row_slot.put_field(
        field_key_buffer[0..],
        json_value_buffer[0..],
        .{ .client_id = test_client_id("client"), .version = 1 },
    );

    @memset(field_key_buffer[0..], 'f');
    @memset(json_value_buffer[0..], 'v');
    @memset(table_name_buffer[0..], 'x');
    @memset(row_key_buffer[0..], 'y');

    try std.testing.expectEqualStrings("table", row_slot.row.table_name);
    try std.testing.expectEqualStrings("row-1", row_slot.row.row_key);
    try std.testing.expectEqualStrings("31", row_slot.row.fields.get("age").?.value);
}
