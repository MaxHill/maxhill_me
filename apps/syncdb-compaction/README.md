# Zig syntax quick reference

Keep this open while coding. Examples target this app's Zig setup.

```zig
const std = @import("std");
const Allocator = std.mem.Allocator;
const root = @import("root.zig"); // module/file import

pub const VERSION: []const u8 = "0.1.0"; // exported global
const LIMIT: usize = 1024;          // private global
```

## Types

```zig
// Integers/floats/bool/void
const a: i32 = -1;
const b: u64 = 42;
const f: f64 = 3.14;
const ok: bool = true;

// Arrays, slices, pointers
var buf: [4]u8 = .{ 1, 2, 3, 4 };
const slice: []const u8 = buf[0..2];
const many: []u8 = buf[0..];
const one_ptr: *u8 = &buf[0];
const many_ptr: [*]u8 = many.ptr;

// Optionals and error unions
var maybe: ?u32 = null;
maybe = 10;
const value = maybe orelse 0;

const E = error{NotFound, BadInput};
fn fallible() E!u32 { return 1; }
const got = try fallible();
```

## Structs

```zig
const User = struct {
    id: u64,
    name: []const u8,
    active: bool = true,

    const Self = @This();

    pub fn init(id: u64, name: []const u8) Self {
        return .{ .id = id, .name = name };
    }

    pub fn rename(self: *Self, name: []const u8) void {
        self.name = name;
    }
};

var user: User = .{ .id = 1, .name = "Ada" };
var other = User.init(2, "Linus");
other.rename("Ziggy");
```

## Enums, unions, tagged unions

```zig
const Color = enum { red, green, blue };
const c: Color = .green;

const Small = enum(u8) { zero = 0, one = 1 };
const n: u8 = @intFromEnum(Small.one);
const e: Small = @enumFromInt(1);

const Value = union(enum) {
    int: i64,
    text: []const u8,
    none,
};

const v: Value = .{ .text = "hi" };
switch (v) {
    .int => |i| std.debug.print("{}\n", .{i}),
    .text => |s| std.debug.print("{s}\n", .{s}),
    .none => {},
}
```

## Functions

```zig
fn add(a: i32, b: i32) i32 {
    return a + b;
}

pub fn writeLine(writer: *std.Io.Writer, msg: []const u8) !void {
    try writer.print("{s}\n", .{msg});
}

fn genericLen(comptime T: type, xs: []const T) usize {
    return xs.len;
}
```

## Control flow

```zig
if (maybe) |x| {
    _ = x;
} else {
    // null
}

while (maybe) |x| : (maybe = null) {
    _ = x;
}

for (slice, 0..) |byte, i| {
    _ = .{ byte, i };
}

const label = switch (c) {
    .red => "r",
    .green => "g",
    .blue => "b",
};
```

## Modules / files

```zig
// src/math.zig
pub const Point = struct { x: f32, y: f32 };
pub fn len(p: Point) f32 { return @sqrt(p.x * p.x + p.y * p.y); }

// src/root.zig or src/main.zig
const math = @import("math.zig");
const p: math.Point = .{ .x = 3, .y = 4 };
const l = math.len(p);
```

## Memory and cleanup

```zig
const gpa = std.testing.allocator;
var list: std.ArrayList(u8) = .empty;
defer list.deinit(gpa);
try list.append(gpa, 42);

const bytes = try gpa.alloc(u8, 128);
defer gpa.free(bytes);

errdefer std.debug.print("runs only on error\n", .{});
```

## Common builtins

No `@asInt`; use `@as`, `@intCast`, `@intFromFloat`, etc.

```zig
const x: i32 = @as(i32, 123);                  // explicit type coercion
const y: i32 = @intCast(@as(i64, 123));        // checked int cast; target from result type
const z: f32 = @floatCast(@as(f64, 1.5));      // float narrowing/widening
const fi: f32 = @floatFromInt(@as(i32, 42));
const ii: i32 = @intFromFloat(@as(f32, 42.0));

const bits: u32 = @bitCast(@as(f32, 1.0));
const T = @TypeOf(bits);
const max = @max(1, 2);
const min = @min(1, 2);
const clipped = @min(value, std.math.maxInt(u32));

const tag_name: []const u8 = @tagName(Color.red);
const imported = @import("std");
// @This() is valid inside a struct/enum/union definition.
```

## Tests

```zig
test "name" {
    try std.testing.expect(add(1, 2) == 3);
    try std.testing.expectEqual(@as(i32, 3), add(1, 2));
}
```
