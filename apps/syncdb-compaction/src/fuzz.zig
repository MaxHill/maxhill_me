const std = @import("std");
const stdx = @import("stdx");
const Io = std.Io;
const Driver = @import("testing/FRNG.zig").Driver;
const syncdb_compaction = @import("syncdb_compaction");
const Fuzzers = @import("./fuzz_sut.zig").Fuzzers;

const MiB = stdx.MiB;

pub fn main(init: std.process.Init) !void {
    // This is appropriate for anything that lives as long as the process.
    const arena: std.mem.Allocator = init.arena.allocator();

    // Accessing command line arguments:
    const arguments = try init.minimal.args.toSlice(arena);

    if (arguments.len < 2) return error.MissingSutPath;
    const sut_path = arguments[1];

    if (arguments.len < 3) return error.MissingFuzzerName;
    const fuzzer_name = arguments[2];
    if (std.meta.stringToEnum(Fuzzers, fuzzer_name) == null) {
        return error.InvalidFuzzerName;
    }

    if (arguments.len < 4) return error.MissingAction;
    const sub_command = std.meta.stringToEnum(enum {
        search,
        replay,
    }, arguments[3]) orelse return error.InvalidChoice;

    switch (sub_command) {
        .search => try Driver.main(
            arena,
            init.io,
            sut_path,
            fuzzer_name,
            .{ .search = .{} },
        ),
        .replay => {
            if (arguments.len < 5) return error.MissingSize;
            const size_argument = arguments[4];
            const size = try std.fmt.parseInt(u32, size_argument, 10);

            if (arguments.len < 6) return error.MissingSize;
            const seed_argument = arguments[5];
            const seed = try std.fmt.parseInt(u64, seed_argument, 10);

            try Driver.main(arena, init.io, sut_path, fuzzer_name, .{
                .replay = .{
                    .size = size,
                    .seed = seed,
                },
            });
        },
    }

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
