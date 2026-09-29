const std = @import("std");
const assert = std.debug.assert;
const crdt = @import("crdt.zig");

const Dot = crdt.Dot;
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
    /// Maximum client-id bytes copied into one operation slot.
    pub const client_id_bytes_capacity = 128;
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
    client_id_storage: [client_id_bytes_capacity]u8 = undefined,
    client_id_len: usize = 0,

    operation: CRDTOperation,
    set_row_value: std.StringHashMap(std.json.Value),
    remove_context: std.StringHashMap(i32),
    active_operation: ?std.meta.Tag(CRDTOperation),
    next_free: ?i32,

    fn init(self: *@This()) !void {
        self.fba = std.heap.FixedBufferAllocator.init(&self.json_storage);
        errdefer self.fba.reset();

        self.set_row_value = std.StringHashMap(std.json.Value).init(self.allocator());
        try self.set_row_value.ensureTotalCapacity(set_row_fields_capacity);

        self.remove_context = std.StringHashMap(i32).init(self.allocator());
        try self.remove_context.ensureTotalCapacity(tombstone_context_capacity);

        self.table_name_len = 0;
        self.row_key_len = 0;
        self.client_id_len = 0;
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
        assert(self.set_row_value.count() == 0);
        assert(self.set_row_value.capacity() >= set_row_fields_capacity);

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
        dot: Dot,
    ) !void {
        assert(self.active_operation == null);
        assert(self.remove_context.count() == 0);
        assert(self.remove_context.capacity() >= tombstone_context_capacity);

        try self.set_table_name(table);
        try self.set_row_key(row_key);
        const stored_dot = try self.copy_dot(dot);

        self.operation = .{ .remove = .{
            .table = self.table_name_storage[0..self.table_name_len],
            .row_key = self.row_key_storage[0..self.row_key_len],
            .dot = stored_dot,
            .context = self.remove_context,
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
        if (dot.client_id.len > self.client_id_storage.len) return error.ClientIdTooLong;

        @memcpy(self.client_id_storage[0..dot.client_id.len], dot.client_id);
        self.client_id_len = dot.client_id.len;
        return .{
            .client_id = self.client_id_storage[0..self.client_id_len],
            .version = dot.version,
        };
    }

    fn reset(self: *@This()) void {
        if (self.active_operation) |tag| {
            switch (tag) {
                .set => {},
                .set_row => self.set_row_value = self.operation.set_row.value,
                .remove => self.remove_context = self.operation.remove.context,
            }
        }

        self.set_row_value.clearRetainingCapacity();
        self.remove_context.clearRetainingCapacity();
        self.table_name_len = 0;
        self.row_key_len = 0;
        self.client_id_len = 0;
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

        var fields = std.StringHashMap(LWWField).init(self.allocator());
        try fields.ensureTotalCapacity(fields_capacity);

        var tombstone_context = std.StringHashMap(i32).init(self.allocator());
        try tombstone_context.ensureTotalCapacity(tombstone_context_capacity);

        self.table_name_len = 0;
        self.row_key_len = 0;
        self.operation = .{
            .table_name = self.table_name_storage[0..0],
            .row_key = self.row_key_storage[0..0],
            .fields = fields,
            .tombstone = .{ .dot = null, .context = tombstone_context },
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
        assert(self.operation.tombstone.context.count() == 0);
        assert(self.operation.tombstone.context.capacity() >= tombstone_context_capacity);

        self.operation.tombstone.dot = dot;
    }

    fn reset(self: *@This()) void {
        var fields = self.operation.fields;
        fields.clearRetainingCapacity();

        var tombstone = self.operation.tombstone;
        tombstone.dot = null;
        tombstone.context.clearRetainingCapacity();

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

        self.operation = UserRow.init(self.allocator());
        try self.operation.ensureTotalCapacity(entries_capacity);
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
        try self.operation.put("_key", .{ .string = self.row_key_storage[0..self.row_key_len] });
    }

    fn reset(self: *@This()) void {
        self.operation.clearRetainingCapacity();
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

test "pools initialize preallocated slots" {
    const allocator = std.testing.allocator;

    var operation_pool = try CRDTOperationPool.init(allocator, 2);
    defer operation_pool.deinit();
    const operation_slot = operation_pool.acquire().?;
    try std.testing.expect(operation_slot.set_row_value.capacity() >= CRDTOperationPoolSlot.set_row_fields_capacity);
    try std.testing.expect(operation_slot.remove_context.capacity() >= CRDTOperationPoolSlot.tombstone_context_capacity);
    operation_pool.release(operation_slot);

    var row_pool = try ORMapRowPool.init(allocator, 2);
    defer row_pool.deinit();
    const row_slot = row_pool.acquire().?;
    try std.testing.expect(row_slot.operation.fields.capacity() >= ORMapRowPoolSlot.fields_capacity);
    try std.testing.expect(row_slot.operation.tombstone.context.capacity() >= ORMapRowPoolSlot.tombstone_context_capacity);
    row_pool.release(row_slot);

    var user_row_pool = try UserRowPool.init(allocator, 2);
    defer user_row_pool.deinit();
    const user_row_slot = user_row_pool.acquire().?;
    try std.testing.expect(user_row_slot.operation.capacity() >= UserRowPoolSlot.entries_capacity);
    user_row_pool.release(user_row_slot);
}

test "pool slots reserve hash map capacity" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();
    try operation_slot.init_set_row("table", "row", .{ .client_id = "client", .version = 1 });
    try std.testing.expect(operation_slot.operation.set_row.value.capacity() >= CRDTOperationPoolSlot.set_row_fields_capacity);

    operation_slot.reset();
    try operation_slot.init_remove("table", "row", .{ .client_id = "client", .version = 1 });
    try std.testing.expect(operation_slot.operation.remove.context.capacity() >= CRDTOperationPoolSlot.tombstone_context_capacity);

    var row_slot: ORMapRowPoolSlot = undefined;
    try row_slot.init();
    try row_slot.init_row("table", "row");
    try std.testing.expect(row_slot.operation.fields.capacity() >= ORMapRowPoolSlot.fields_capacity);
    row_slot.init_tombstone(.{ .client_id = "client", .version = 1 });
    try std.testing.expect(row_slot.operation.tombstone.context.capacity() >= ORMapRowPoolSlot.tombstone_context_capacity);

    var user_row_slot: UserRowPoolSlot = undefined;
    try user_row_slot.init();
    user_row_slot.init_user_row();
    try std.testing.expect(user_row_slot.operation.capacity() >= UserRowPoolSlot.entries_capacity);
}

test "operation slot copies operation identity strings" {
    var operation_slot: CRDTOperationPoolSlot = undefined;
    try operation_slot.init();

    var table_name_buffer = [_]u8{ 't', 'a', 'b', 'l', 'e' };
    var row_key_buffer = [_]u8{ 'r', 'o', 'w', '-', '1' };
    var client_id_buffer = [_]u8{ 'c', 'l', 'i', 'e', 'n', 't' };

    try operation_slot.init_set_row(
        table_name_buffer[0..],
        row_key_buffer[0..],
        .{ .client_id = client_id_buffer[0..], .version = 1 },
    );

    @memset(table_name_buffer[0..], 'x');
    @memset(row_key_buffer[0..], 'y');
    @memset(client_id_buffer[0..], 'z');

    try std.testing.expectEqualStrings("table", operation_slot.operation.set_row.table);
    try std.testing.expectEqualStrings("row-1", operation_slot.operation.set_row.row_key);
    try std.testing.expectEqualStrings("client", operation_slot.operation.set_row.dot.client_id);
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

    try std.testing.expectEqualStrings("row-1", user_row_slot.operation.get("_key").?.string);
}
