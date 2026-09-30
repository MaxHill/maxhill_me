const std = @import("std");
const assert = std.debug.assert;
const crdt = @import("crdt.zig");

const Dot = crdt.Dot;
const Context = crdt.Context;
const ClientId = crdt.ClientId;
const Tombstone = crdt.Tombstone;
const SetRowFields = crdt.SetRowFields;
const ValidKey = crdt.ValidKey;
const CRDTOperation = crdt.CRDTOperation;
const LWWField = crdt.LWWField;
const ORMapRow = crdt.ORMapRow;
const UserRow = crdt.UserRow;

pub const CRDTOperationPoolSlot = struct {
    /// Maximum fields in a set_row operation value.
    pub const set_row_fields_capacity = 200;
    /// Maximum client IDs in a remove operation tombstone context.
    pub const tombstone_context_capacity = 200;
    /// Maximum table-name bytes copied into one operation slot.
    pub const table_name_bytes_capacity = 64;
    /// Maximum row-key bytes copied into one operation slot.
    pub const row_key_bytes_capacity = 256;
    /// Bytes available for one operation's parsed JSON representation.
    pub const json_storage_capacity = 32 * 1024;

    /// All memory used to build the dynamic JSON representation
    /// comes from this buffer.
    json_storage: [json_storage_capacity]u8 = undefined,
    /// Allocator backed directly by json_storage.
    fba: std.heap.FixedBufferAllocator = undefined,

    table_name_storage: [table_name_bytes_capacity]u8 = undefined,
    table_name_len: usize = 0,
    row_key_storage: [row_key_bytes_capacity]u8 = undefined,
    row_key_len: usize = 0,

    operation: CRDTOperation,
    set_row_value: SetRowFields,
    active_operation: ?std.meta.Tag(CRDTOperation),
    next_free: ?i32,

    fn init(self: *@This()) !void {
        self.fba = std.heap.FixedBufferAllocator.init(&self.json_storage);
        errdefer self.fba.reset();

        self.set_row_value = .{};

        self.table_name_len = 0;
        self.row_key_len = 0;
        self.operation = undefined;
        self.active_operation = null;
        self.next_free = null;
    }
    fn allocator(self: *@This()) std.mem.Allocator {
        return self.fba.allocator();
    }

    pub fn init_set_row(
        self: *@This(),
        table: []const u8,
        row_key: []const u8,
        dot: Dot,
    ) !void {
        assert(self.active_operation == null);
        assert(self.set_row_value.count == 0);

        try self.set_table_name(table);
        try self.set_row_key(row_key);
        const stored_dot = try self.copy_dot(dot);

        self.operation = .{ .set_row = .{
            .table = self.table_name_storage[0..self.table_name_len],
            .row_key = self.row_key_storage[0..self.row_key_len],
            .value = self.set_row_value,
            .dot = stored_dot,
        } };
        self.active_operation = .set_row;
    }

    pub fn init_remove(
        self: *@This(),
        table: []const u8,
        row_key: []const u8,
        tombstone: Tombstone,
    ) !void {
        assert(self.active_operation == null);
        tombstone.assert_valid();

        try self.set_table_name(table);
        try self.set_row_key(row_key);

        self.operation = .{ .remove = .{
            .table = self.table_name_storage[0..self.table_name_len],
            .row_key = self.row_key_storage[0..self.row_key_len],
            .tombstone = tombstone,
        } };
        self.active_operation = .remove;
    }

    fn set_table_name(self: *@This(), table_name: []const u8) !void {
        if (table_name.len > self.table_name_storage.len) return error.TableNameTooLong;

        @memcpy(self.table_name_storage[0..table_name.len], table_name);
        self.table_name_len = table_name.len;
    }

    fn set_row_key(self: *@This(), row_key: []const u8) !void {
        if (row_key.len > self.row_key_storage.len) return error.RowKeyTooLong;

        @memcpy(self.row_key_storage[0..row_key.len], row_key);
        self.row_key_len = row_key.len;
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

    pub fn acquire(self: *@This()) ?*CRDTOperationPoolSlot {
        const index = self.free_head orelse {
            return null;
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
    /// Maximum fields stored in one row.
    pub const fields_capacity = 200;
    /// Maximum client IDs retained by one row tombstone.
    pub const tombstone_context_capacity = 200;
    /// Maximum table-name bytes copied into one row slot.
    pub const table_name_bytes_capacity = 64;
    /// Maximum row-key bytes copied into one row slot.
    pub const row_key_bytes_capacity = 256;
    /// Bytes available for one row and its hash maps.
    pub const storage_capacity = 32 * 1024;

    /// All memory owned by a row and its hash maps comes from this buffer.
    storage: [storage_capacity]u8 = undefined,
    /// Allocator backed directly by storage.
    fba: std.heap.FixedBufferAllocator = undefined,

    table_name_storage: [table_name_bytes_capacity]u8 = undefined,
    table_name_len: usize = 0,
    row_key_storage: [row_key_bytes_capacity]u8 = undefined,
    row_key_len: usize = 0,

    operation: ORMapRow,
    next_free: ?i32,

    fn init(self: *@This()) !void {
        self.fba = std.heap.FixedBufferAllocator.init(&self.storage);
        errdefer self.fba.reset();

        const fields = crdt.ORMapRowFields{};

        self.table_name_len = 0;
        self.row_key_len = 0;
        self.operation = .{
            .table_name = self.table_name_storage[0..0],
            .row_key = self.row_key_storage[0..0],
            .fields = fields,
            .tombstone = .{ .dot = null, .context = .{} },
        };
        self.next_free = null;
    }
    fn allocator(self: *@This()) std.mem.Allocator {
        return self.fba.allocator();
    }

    pub fn init_row(
        self: *@This(),
        table_name: []const u8,
        row_key: ValidKey,
    ) !void {
        self.reset();
        try self.set_table_name(table_name);
        try self.set_row_key(row_key);
    }

    fn set_table_name(self: *@This(), table_name: []const u8) !void {
        if (table_name.len > self.table_name_storage.len) return error.TableNameTooLong;

        @memcpy(self.table_name_storage[0..table_name.len], table_name);
        self.table_name_len = table_name.len;
        self.operation.table_name = self.table_name_storage[0..self.table_name_len];
    }

    fn set_row_key(self: *@This(), row_key: []const u8) !void {
        if (row_key.len > self.row_key_storage.len) return error.RowKeyTooLong;

        @memcpy(self.row_key_storage[0..row_key.len], row_key);
        self.row_key_len = row_key.len;
        self.operation.row_key = self.row_key_storage[0..self.row_key_len];
    }

    pub fn init_tombstone(self: *@This(), dot: Dot) void {
        assert(!self.operation.tombstone.active());
        assert(self.operation.tombstone.context.count == 0);

        self.operation.tombstone.dot = dot;
    }

    fn reset(self: *@This()) void {
        var fields = self.operation.fields;
        fields.clear();

        var tombstone = self.operation.tombstone;
        tombstone.dot = null;
        tombstone.context = .{};

        self.table_name_len = 0;
        self.row_key_len = 0;
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

    pub fn acquire(self: *@This()) ?*ORMapRowPoolSlot {
        const index = self.free_head orelse {
            return null;
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

pub const UserRowPoolSlot = struct {
    /// Maximum entries in one user-facing row: every row field plus
    /// _key.
    pub const entries_capacity = ORMapRowPoolSlot.fields_capacity + 1;
    /// Maximum row-key bytes copied into one user-facing row slot.
    pub const row_key_bytes_capacity = ORMapRowPoolSlot.row_key_bytes_capacity;
    /// Bytes available for one user-facing row's hash map.
    pub const storage_capacity = 32 * 1024;

    /// All memory owned by a user-facing row's hash map comes from
    /// this buffer.
    storage: [storage_capacity]u8 = undefined,
    /// Allocator backed directly by storage.
    fba: std.heap.FixedBufferAllocator = undefined,

    row_key_storage: [row_key_bytes_capacity]u8 = undefined,
    row_key_len: usize = 0,

    operation: UserRow,
    next_free: ?i32,

    fn init(self: *@This()) !void {
        self.fba = std.heap.FixedBufferAllocator.init(&self.storage);
        errdefer self.fba.reset();

        self.operation = .{};
        self.row_key_len = 0;
        self.next_free = null;
    }
    fn allocator(self: *@This()) std.mem.Allocator {
        return self.fba.allocator();
    }

    pub fn init_user_row(self: *@This()) void {
        self.reset();
    }

    pub fn put_row_key(self: *@This(), row_key: []const u8) !void {
        if (row_key.len > self.row_key_storage.len) return error.RowKeyTooLong;

        @memcpy(self.row_key_storage[0..row_key.len], row_key);
        self.row_key_len = row_key.len;
        self.operation.put("_key", self.row_key_storage[0..self.row_key_len]);
    }

    fn reset(self: *@This()) void {
        self.operation.clear();
        self.row_key_len = 0;
        self.next_free = null;
    }
};
pub const UserRowPool = struct {
    allocator: std.mem.Allocator,
    slots: []UserRowPoolSlot,
    free_head: ?i32,

    pub fn init(allocator: std.mem.Allocator, capacity: i32) !@This() {
        assert(capacity > 0);
        assert(capacity < std.math.maxInt(i32));

        const slots = try allocator.alloc(
            UserRowPoolSlot,
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

    pub fn acquire(self: *@This()) ?*UserRowPoolSlot {
        const index = self.free_head orelse {
            return null;
        };

        const slot = &self.slots[@intCast(index)];
        self.free_head = slot.next_free;
        slot.next_free = null;

        return slot;
    }
    pub fn release(
        self: *@This(),
        slot: *UserRowPoolSlot,
    ) void {
        const index = self.indexOf(slot);

        slot.reset();

        slot.next_free = self.free_head;
        self.free_head = index;
    }

    fn indexOf(
        self: *@This(),
        slot: *UserRowPoolSlot,
    ) i32 {
        const pool_start = @intFromPtr(self.slots.ptr);
        const slot_address = @intFromPtr(slot);
        const offset = slot_address - pool_start;

        return @intCast(offset / @sizeOf(UserRowPoolSlot));
    }
};

fn assert_pool_constants_valid() void {
    assert(CRDTOperationPoolSlot.set_row_fields_capacity > 0);
    assert(CRDTOperationPoolSlot.tombstone_context_capacity > 0);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity > 0);
    assert(CRDTOperationPoolSlot.json_storage_capacity > 0);
    assert(CRDTOperationPoolSlot.set_row_fields_capacity <= 200);
    assert(CRDTOperationPoolSlot.tombstone_context_capacity <= 200);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity <= 1024);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity <= 1024);
    assert(CRDTOperationPoolSlot.json_storage_capacity >= 1024);
    assert(ORMapRowPoolSlot.fields_capacity > 0);
    assert(ORMapRowPoolSlot.tombstone_context_capacity > 0);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity > 0);
    assert(ORMapRowPoolSlot.storage_capacity > 0);
    assert(ORMapRowPoolSlot.fields_capacity <= 200);
    assert(ORMapRowPoolSlot.tombstone_context_capacity <= 200);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity <= 1024);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity <= 1024);
    assert(ORMapRowPoolSlot.storage_capacity >= 1024);
    assert(UserRowPoolSlot.entries_capacity > 0);
    assert(UserRowPoolSlot.row_key_bytes_capacity > 0);
    assert(UserRowPoolSlot.storage_capacity > 0);
    assert(UserRowPoolSlot.entries_capacity == ORMapRowPoolSlot.fields_capacity + 1);
    assert(UserRowPoolSlot.row_key_bytes_capacity == ORMapRowPoolSlot.row_key_bytes_capacity);
    assert(UserRowPoolSlot.storage_capacity >= 1024);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity == ORMapRowPoolSlot.table_name_bytes_capacity);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity == ORMapRowPoolSlot.row_key_bytes_capacity);
    assert(CRDTOperationPoolSlot.tombstone_context_capacity == ORMapRowPoolSlot.tombstone_context_capacity);
    assert(CRDTOperationPoolSlot.set_row_fields_capacity == ORMapRowPoolSlot.fields_capacity);
    assert(@sizeOf(CRDTOperationPoolSlot) > @sizeOf(CRDTOperation));
    assert(@sizeOf(ORMapRowPoolSlot) > @sizeOf(ORMapRow));
    assert(@sizeOf(UserRowPoolSlot) > @sizeOf(UserRow));
    assert(@sizeOf(ClientId) == 16);
    assert(@sizeOf(Context) > @sizeOf(ClientId));
    assert(@sizeOf(Dot) >= @sizeOf(ClientId));
    assert(@sizeOf(ValidKey) == @sizeOf([]const u8));
    assert(@sizeOf(LWWField) >= @sizeOf(Dot));
    assert(CRDTOperationPoolSlot.json_storage_capacity >= CRDTOperationPoolSlot.set_row_fields_capacity);
    assert(CRDTOperationPoolSlot.json_storage_capacity >= CRDTOperationPoolSlot.tombstone_context_capacity);
    assert(ORMapRowPoolSlot.storage_capacity >= ORMapRowPoolSlot.fields_capacity);
    assert(ORMapRowPoolSlot.storage_capacity >= ORMapRowPoolSlot.tombstone_context_capacity);
    assert(UserRowPoolSlot.storage_capacity >= UserRowPoolSlot.entries_capacity);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity >= 16);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity >= 16);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity >= 16);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity >= 16);
    assert(UserRowPoolSlot.row_key_bytes_capacity >= 16);
    assert(CRDTOperationPoolSlot.json_storage_capacity <= 1024 * 1024);
    assert(ORMapRowPoolSlot.storage_capacity <= 1024 * 1024);
    assert(UserRowPoolSlot.storage_capacity <= 1024 * 1024);
    assert(CRDTOperationPoolSlot.table_name_bytes_capacity < CRDTOperationPoolSlot.json_storage_capacity);
    assert(CRDTOperationPoolSlot.row_key_bytes_capacity < CRDTOperationPoolSlot.json_storage_capacity);
    assert(ORMapRowPoolSlot.table_name_bytes_capacity < ORMapRowPoolSlot.storage_capacity);
    assert(ORMapRowPoolSlot.row_key_bytes_capacity < ORMapRowPoolSlot.storage_capacity);
    assert(UserRowPoolSlot.row_key_bytes_capacity < UserRowPoolSlot.storage_capacity);
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

    const allocator = std.testing.allocator;

    var operation_pool = try CRDTOperationPool.init(allocator, 2);
    defer operation_pool.deinit();
    const operation_slot = operation_pool.acquire().?;
    try std.testing.expectEqual(@as(usize, 0), operation_slot.set_row_value.count);
    try std.testing.expect(operation_slot.active_operation == null);
    operation_pool.release(operation_slot);

    var row_pool = try ORMapRowPool.init(allocator, 2);
    defer row_pool.deinit();
    const row_slot = row_pool.acquire().?;
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.fields.count);
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.tombstone.context.count);
    row_pool.release(row_slot);

    var user_row_pool = try UserRowPool.init(allocator, 2);
    defer user_row_pool.deinit();
    const user_row_slot = user_row_pool.acquire().?;
    try std.testing.expectEqual(@as(usize, 0), user_row_slot.operation.count);
    user_row_pool.release(user_row_slot);
}

test "pool slots reserve operation storage" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();
    try operation_slot.init_set_row("table", "row", .{ .client_id = test_client_id("client"), .version = 1 });
    try std.testing.expectEqual(@as(usize, 0), operation_slot.operation.set_row.value.count);

    operation_slot.reset();
    try operation_slot.init_remove("table", "row", .{
        .dot = .{ .client_id = test_client_id("client"), .version = 1 },
        .context = .{},
    });
    try std.testing.expectEqual(@as(usize, 0), operation_slot.operation.remove.tombstone.context.count);

    var row_slot: ORMapRowPoolSlot = undefined;
    try row_slot.init();
    try row_slot.init_row("table", "row");
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.fields.count);
    row_slot.init_tombstone(.{ .client_id = test_client_id("client"), .version = 1 });
    try std.testing.expectEqual(@as(usize, 0), row_slot.operation.tombstone.context.count);

    var user_row_slot: UserRowPoolSlot = undefined;
    try user_row_slot.init();
    user_row_slot.init_user_row();
    try std.testing.expectEqual(@as(usize, 0), user_row_slot.operation.count);
}

test "operation slot copies operation identity strings" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();

    var table_name_buffer = [_]u8{ 't', 'a', 'b', 'l', 'e' };
    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };
    var client_id_buffer = test_client_id("client");
    const expected_client_id = client_id_buffer;

    try operation_slot.init_set_row(
        table_name_buffer[0..],
        row_key_buffer[0..],
        .{ .client_id = client_id_buffer, .version = 1 },
    );

    @memset(table_name_buffer[0..], 'x');
    @memset(row_key_buffer[0..], 'y');
    @memset(&client_id_buffer, 'z');

    try std.testing.expectEqualStrings("table", operation_slot.operation.set_row.table);
    try std.testing.expectEqualStrings("row-1", operation_slot.operation.set_row.row_key);
    try std.testing.expectEqualSlices(u8, &expected_client_id, &operation_slot.operation.set_row.dot.client_id);
}

test "row slot copies row identity strings" {
    var row_slot: ORMapRowPoolSlot = undefined;
    try row_slot.init();

    var table_name_buffer = [_]u8{ 't', 'a', 'b', 'l', 'e' };
    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };

    try row_slot.init_row(table_name_buffer[0..], row_key_buffer[0..]);

    @memset(table_name_buffer[0..], 'x');
    @memset(row_key_buffer[0..], 'y');

    try std.testing.expectEqualStrings("table", row_slot.operation.table_name);
    try std.testing.expectEqualStrings("row-1", row_slot.operation.row_key);
}

test "user row slot copies row key string" {
    var user_row_slot: UserRowPoolSlot = undefined;
    try user_row_slot.init();

    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };
    try user_row_slot.put_row_key(row_key_buffer[0..]);

    @memset(row_key_buffer[0..], 'y');

    try std.testing.expectEqualStrings("row-1", user_row_slot.operation.get("_key").?);
}
