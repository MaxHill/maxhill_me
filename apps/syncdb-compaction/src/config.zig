const std = @import("std");
const stdx = @import("stdx.zig");
const assert = std.debug.assert;

const KiB = stdx.KiB;

const Config = struct {
    crdt: CRDT = .{},

    const CRDT = struct {
        fields_count_max: i32 = 200,
        table_name_byte_capacity: i32 = 64,
        key_byte_capacity: i32 = 256,
        json_value_byte_capacity: i32 = 32 * KiB,
    };

    pub fn current() @This() {
        const config: @This() = .{};
        comptime {
            assert(config.crdt.fields_count_max > 0);
            assert(config.crdt.table_name_byte_capacity > 0);
        }
        return config;
    }
};

const Constants = struct {
    crdt_fields_count_max: i32,
    crdt_tombstone_vectors_count_max: i32,
    crdt_table_name_byte_capacity: i32,
    crdt_row_key_byte_capacity: i32,
    crdt_field_key_byte_capacity: i32,
    crdt_json_value_byte_capacity: i32,

    pub fn init() @This() {
        const config = Config.current();
        comptime {
            assert(config.crdt.fields_count_max > 0);
            assert(config.crdt.json_value_byte_capacity > 1 * KiB);
        }

        return .{
            .crdt_fields_count_max = config.crdt.fields_count_max,
            .crdt_tombstone_vectors_count_max = config.crdt.fields_count_max,
            .crdt_table_name_byte_capacity = config.crdt.table_name_byte_capacity,
            .crdt_row_key_byte_capacity = config.crdt.key_byte_capacity,
            .crdt_field_key_byte_capacity = config.crdt.key_byte_capacity,
            .crdt_json_value_byte_capacity = config.crdt.json_value_byte_capacity,
        };
    }
};

pub const constants = Constants.init();
