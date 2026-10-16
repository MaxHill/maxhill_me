const std = @import("std");
const FRNG = @import("testing/FRNG.zig");

pub fn main(frng: FRNG) void {
    std.log.info("fuzzer={s}", .{"crdt"});
    _ = frng;
}
