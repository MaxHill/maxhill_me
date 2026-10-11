const std = @import("std");
const Io = std.Io;
const Driver = @import("testing/FRNG.zig").Driver;

const syncdb_compaction = @import("syncdb_compaction");

pub fn main(init: std.process.Init) !void {
    // This is appropriate for anything that lives as long as the process.
    const arena: std.mem.Allocator = init.arena.allocator();

    // Accessing command line arguments:
    const arguments = try init.minimal.args.toSlice(arena);
    for (arguments) |arg| {
        std.log.info("arg: {s}", .{arg});
    }
    if (arguments.len < 2) return error.MissingSutPath;
    const sut_path = arguments[1];

    try Driver.main(arena, init.io, sut_path, .{ .search = .{} });

    // Stdout is for the actual output of your application, for example if you
    // are implementing gzip, then only the compressed bytes should be sent to
    // stdout, not any debugging messages.
    var stdout_buffer: [1024]u8 = undefined;
    var stdout_file_writer: Io.File.Writer = .init(
        .stdout(),
        init.io,
        &stdout_buffer,
    );
    const stdout_writer = &stdout_file_writer.interface;

    try syncdb_compaction.printAnotherMessage(stdout_writer);

    try stdout_writer.flush(); // Don't forget to flush!
}
