const std = @import("std");
const assert = std.debug.assert;
const FRNG = @import("testing/FRNG.zig");
const syncdb_compaction = @import("syncdb_compaction");

const crdt = syncdb_compaction.crdt;
const crdt_pools = syncdb_compaction.crdt_pools;

pub fn main(frng: *FRNG, arena: std.mem.Allocator) !void {
    std.log.info("fuzzer={s}", .{"crdt"});
    var row_pool = try crdt_pools.ORMapRowPool.init(arena, 1);
    var operation_pool = try crdt_pools.CRDTOperationPool.init(arena, 10);

    const table_name = try FRNG.bytes(frng, 10);
    const row_key = try FRNG.bytes(frng, 10);
    const row_slot = try row_pool.acquire();
    defer row_pool.release(row_slot);
    try row_slot.put_row(table_name, row_key);

    var iteration: i32 = 0;
    while (true) {
        iteration += 1;
        assert(iteration > 0);
        assert(iteration < 1_000_000);

        const field_key = try FRNG.bytes(frng, 10);
        const json_value = "{\"thing\": 1}";

        const client_id = try crdt
            .ClientId
            .from_string("0d676a81-7600-4afb-95ff-e6925cffb955");
        const dot: crdt.Dot = .{
            .client_id = client_id,
            .version = iteration,
        };
        const operation_slot = try operation_pool.acquire();
        defer operation_pool.release(operation_slot);

        try operation_slot.put_set_row_operation(
            table_name,
            row_key,
            dot,
        );
        try operation_slot.put_set_row_field(field_key, json_value);

        crdt.apply_operation_to_row(&row_slot.row, operation_slot.operation);
    }
}
