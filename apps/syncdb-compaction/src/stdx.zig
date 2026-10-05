const std = @import("std");
const assert = std.debug.assert;

// Import these as `const GiB = stdx.GiB;`
pub const KiB = 1 << 10;
pub const MiB = 1 << 20;
pub const GiB = 1 << 30;
pub const TiB = 1 << 40;
pub const PiB = 1 << 50;
