const std = @import("std");
const Io = std.Io;
const FRNG = @import("testing/FRNG.zig");
const crdt_fuzz = @import("crdt_fuzz.zig");

const syncdb_compaction = @import("syncdb_compaction");

pub const Fuzzers = enum { crdt };

pub fn main(init: std.process.Init) !void {
    // Prints to stderr, unbuffered, ignoring potential errors.
    std.log.info("bin={s}", .{"fuzz_sut"});

    // This is appropriate for anything that lives as long as the process.

    const arena: std.mem.Allocator = init.arena.allocator();

    // Accessing command line arguments:
    const arguments = try init.minimal.args.toSlice(arena);
    for (arguments) |arg| {
        std.log.info("SUT arg: {s}", .{arg});
    }
    if (arguments.len < 2) return error.MissingFuzzerName;
    const fuzzer = std.meta.stringToEnum(Fuzzers, arguments[1]) orelse
        return error.InvalidChoice;
    std.log.info("SUT arg: {d}", .{fuzzer});

    // In order to do I/O operations need an `Io` instance.
    const io = init.io;
    var stdin_reader = std.Io.File.stdin().reader(io, &.{});
    const entropy = try stdin_reader.interface
        .allocRemaining(arena, .unlimited);

    return (switch (fuzzer) {
        .crdt => blk: {
            var frng = FRNG.init(entropy);
            break :blk crdt_fuzz.main(&frng, arena);
        },
    }) catch |err| switch (err) {
        FRNG.Error.OutOfEntropy => return,
        else => return err,
    };
}
