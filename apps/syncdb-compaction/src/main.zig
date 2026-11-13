const std = @import("std");
const Io = std.Io;
const assert = std.debug.assert;
const zqlite = @import("zqlite");

const syncdb_compaction = @import("syncdb_compaction");

pub fn main(init: std.process.Init) !void {
    // Prints to stderr, unbuffered, ignoring potential errors.
    std.debug.print("All your {s} are belong to us.\n", .{"codebase"});

    // This is appropriate for anything that lives as long as the process.
    const arena: std.mem.Allocator = init.arena.allocator();

    var env = init.environ_map;

    const data_home = env.get("XDG_DATA_HOME") orelse blk: {
        const home = env.get("HOME") orelse return error.MissingHomeEnvironmentVariable;
        break :blk try std.fmt.allocPrint(arena, "{s}/.local/share", .{home});
    };
    std.debug.print("data_home: {s}\n", .{data_home});

    const flags = zqlite.OpenFlags.Create | zqlite.OpenFlags.EXResCode;
    var conn = try zqlite.open("/tmp/test.sqlite", flags);
    defer conn.close();

    try conn.exec("create table if not exists test (name text)", .{});
    try conn.exec("insert into test (name) values (?1), (?2)", .{ "Leto", "Ghanima" });

    {
        if (try conn.row("select * from test order by name limit 1", .{})) |row| {
            defer row.deinit();
            std.debug.print("name: {s}\n", .{row.text(0)});
        }
    }

    {
        var rows = try conn.rows("select * from test order by name", .{});
        defer rows.deinit();
        while (rows.next()) |row| {
            std.debug.print("name: {s}\n", .{row.text(0)});
        }
        if (rows.err) |err| return err;
    }

    // Accessing command line arguments:
    // const arguments = try init.minimal.args.toSlice(arena);
    // for (arguments) |arg| {
    //     std.log.info("arg: {s}", .{arg});
    // }

    // In order to do I/O operations need an `Io` instance.
    const io = init.io;

    // Stdout is for the actual output of your application, for example if you
    // are implementing gzip, then only the compressed bytes should be sent to
    // stdout, not any debugging messages.
    var stdout_buffer: [1024]u8 = undefined;
    var stdout_file_writer: Io.File.Writer = .init(.stdout(), io, &stdout_buffer);
    const stdout_writer = &stdout_file_writer.interface;

    try syncdb_compaction.printAnotherMessage(stdout_writer);

    try stdout_writer.flush(); // Don't forget to flush!
}
