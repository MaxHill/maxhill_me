const std = @import("std");
const stdx = @import("stdx");
const assert = std.debug.assert;
const FRNG = @import("testing/FRNG.zig");
const syncdb_compaction = @import("syncdb_compaction");
const constants = @import("config").constants;

const crdt = syncdb_compaction.crdt;
const crdt_pools = syncdb_compaction.crdt_pools;
const KiB = stdx.KiB;

pub fn main(frng: *FRNG, arena: std.mem.Allocator) !void {
    std.log.info("fuzzer={s}", .{"crdt"});
    var row_pool = try crdt_pools.ORMapRowPool.init(arena, 1);
    var operation_pool = try crdt_pools.CRDTOperationPool.init(arena, 10);

    const table_name = try FRNG.bytes(frng, 10);
    const row_key = try FRNG.bytes(frng, 10);
    const row_slot = try row_pool.acquire();
    defer row_pool.release(row_slot);
    try row_slot.init_row(table_name, row_key);

    var iteration: i32 = 0;
    while (true) {
        iteration += 1;
        assert(iteration > 0);
        assert(iteration < 1_000_000);

        const client_index = try FRNG.int_inclusive(frng, u8, 3);
        var client_id_bytes: crdt.ClientId.Bytes = .{0} ** 16;
        client_id_bytes[0] = client_index + 1;

        const fake_uuid = crdt.ClientId.to_string(client_id_bytes);
        const client_id = try crdt.ClientId.from_string(&fake_uuid);
        const dot: crdt.Dot = .{
            .client_id = client_id,
            .version = iteration,
        };

        const operation_slot = try operation_pool.acquire();
        defer operation_pool.release(operation_slot);
        const operation_kind = try FRNG.weighted(frng, .{
            .set_row = 9,
            .remove_row = 1,
        });
        switch (operation_kind) {
            .set_row => {
                const field_key = try FRNG.bytes(frng, 10);

                var json_value_buffer: [constants.crdt_json_value_byte_capacity]u8 =
                    undefined;
                const json_value = try randomJsonValue(frng, json_value_buffer[0..], 2);

                try operation_slot.init_set_row_operation(
                    table_name,
                    row_key,
                    dot,
                    &.{.{
                        .field_key = field_key,
                        .json_value = json_value,
                    }},
                );
            },
            .remove_row => try operation_slot.init_remove_row_operation(
                table_name,
                row_key,
                row_slot.row.tombstone_for_remove(dot),
            ),
        }

        crdt.apply_operation_to_row(&row_slot.row, operation_slot.operation);
    }
}

fn randomJsonValue(frng: *FRNG, out: []u8, depth: u8) ![]const u8 {
    assert(depth >= 0);
    assert(depth <= 4);
    const max_tag: u8 = if (depth == 0) 3 else 4;
    const tag = try FRNG.int_inclusive(frng, u8, max_tag);

    return switch (tag) {
        0 => try std.fmt.bufPrint(out, "null", .{}),
        1 => try std.fmt.bufPrint(out, "{}", .{try FRNG.int(frng, u32)}),
        2 => try std.fmt.bufPrint(out, "{s}", .{
            if (try FRNG.boolean(frng))
                "true"
            else
                "false",
        }),
        3 => blk: {
            const b = try FRNG.array(frng, 8);
            const hex = std.fmt.bytesToHex(b, .lower);
            break :blk try std.fmt.bufPrint(out, "\"{s}\"", .{hex[0..]});
        },
        else => blk: {
            var left_buf: [128]u8 = undefined;
            var right_buf: [128]u8 = undefined;
            const left = try randomJsonValue(frng, left_buf[0..], depth - 1);
            const right = try randomJsonValue(frng, right_buf[0..], depth - 1);

            break :blk try std.fmt.bufPrint(
                out,
                "{{\"{}\":{s},\"{}\":{s},\"ok\":{s}}}",
                .{
                    try FRNG.int(frng, u16),                         left,
                    try FRNG.int(frng, u16),                         right,
                    if (try FRNG.boolean(frng)) "true" else "false",
                },
            );
        },
    };
}
