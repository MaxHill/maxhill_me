//! By convention, root.zig is the root source file when making a package.
const std = @import("std");
const Io = std.Io;
const assert = std.debug.assert;
pub const crdt = @import("crdt.zig");

pub const lint = @import("lint.zig");

test {
    // Pull lint.zig tests into the package test binary.
    _ = lint;
    _ = crdt;
}
