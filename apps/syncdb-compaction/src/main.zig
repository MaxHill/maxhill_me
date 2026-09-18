const std = @import("std");
const Io = std.Io;

const syncdb_compaction = @import("syncdb_compaction");

const Dot = struct {
    clientId: []u8,
    version: i32, // TODO: is i32 the correct type?
};

const ValidKey = []u8;

const CRDTOperation = union(enum) {
    set: struct {
        table: []u8,
        rowKey: []u8,
        field: ?[]u8,
        value: []u8,
        dot: Dot,
    },
    set_row: struct {
        table: []u8,
        rowKey: []u8,
        field: ?[]u8,
        value: std.StringHashMap([]const u8), // TODO may need allocation can we do some other way?
        dot: Dot,
    },
    remove: struct {
        table: []u8,
        rowKey: []u8,
        dot: Dot,
        context: std.StringHashMap(i32), // TODO may need allocation can we do some other way?
    },
};

const LWWField = struct {
    value: []u8, // TODO: In typescript this is any, this is wrong but we need to be more precise
    dot: Dot,
};

const ORMapRow = struct {
    table_name: []u8,
    row_key: ValidKey,
    fields: std.StringHashMap(LWWField),
    tombstone: ?struct { dot: Dot, context: std.StringHashMap(i32) },
};

pub fn main(init: std.process.Init) !void {
    // Prints to stderr, unbuffered, ignoring potential errors.
    std.debug.print("All your {s} are belong to us.\n", .{"codebase"});

    // This is appropriate for anything that lives as long as the process.
    const arena: std.mem.Allocator = init.arena.allocator();

    // Accessing command line arguments:
    const arguments = try init.minimal.args.toSlice(arena);
    for (arguments) |arg| {
        std.log.info("arg: {s}", .{arg});
    }

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

pub fn thing() void {
    std.debug.print("Test", .{});
}

test "simple test" {
    const gpa = std.testing.allocator;
    var list: std.ArrayList(i32) = .empty;
    defer list.deinit(gpa); // Try commenting this out and see if zig detects the memory leak!
    try list.append(gpa, 42);
    try std.testing.expectEqual(@as(i32, 42), list.pop());
}

test "fuzz example" {
    try std.testing.fuzz({}, testOne, .{});
}

fn testOne(context: void, smith: *std.testing.Smith) !void {
    _ = context;
    // Try passing `--fuzz` to `zig build test` and see if it manages to fail this test case!

    const gpa = std.testing.allocator;
    var list: std.ArrayList(u8) = .empty;
    defer list.deinit(gpa);
    while (!smith.eos()) switch (smith.value(enum { add_data, dup_data })) {
        .add_data => {
            const slice = try list.addManyAsSlice(gpa, smith.value(u4));
            smith.bytes(slice);
        },
        .dup_data => {
            if (list.items.len == 0) continue;
            if (list.items.len > std.math.maxInt(u32)) return error.SkipZigTest;
            const length = smith.valueRangeAtMost(u32, 1, @min(32, list.items.len));
            const off = smith.valueRangeAtMost(u32, 0, @intCast(list.items.len - length));
            try list.appendSlice(gpa, list.items[off..][0..length]);
            try std.testing.expectEqualSlices(
                u8,
                list.items[off..][0..length],
                list.items[list.items.len - length ..],
            );
        },
    };
}
