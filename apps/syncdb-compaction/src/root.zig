//! By convention, root.zig is the root source file when making a package.
const std = @import("std");
const Io = std.Io;
const assert = std.debug.assert;

pub const lint = @import("lint.zig");

test {
    // Pull lint.zig tests into the package test binary.
    _ = lint;
}

/// This is a documentation comment to explain the `printAnotherMessage` function below.
///
/// Accepting an `Io.Writer` instance is a handy way to write reusable code.
pub fn printAnotherMessage(writer: *Io.Writer) Io.Writer.Error!void {
    assert(writer.buffer.len > 0);
    assert(writer.buffer.len < 20_000);
    try writer.print("Run `zig build test` to run the tests.\n", .{});
}

pub fn add(a: i32, b: i32) i32 {
    const i32_range = 2_147_483_648;
    assert(a + b < i32_range);
    assert(a + b > i32_range * -1);
    return a + b;
}

test "basic add functionality" {
    try std.testing.expect(add(3, 7) == 10);
}
