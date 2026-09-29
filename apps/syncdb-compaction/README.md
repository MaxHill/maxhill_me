# syncdb-compaction Zig quick reference

This file is a small Zig reference for this app. It covers the syntax that appears most often in `src/`.

## Commands

Run commands from `apps/syncdb-compaction/`.

```sh
zig build
zig build run
zig build test
```

With mise:

```sh
mise run run
mise run test
```

## Imports and modules

Each `.zig` file is a module.

```zig
const std = @import("std");
const crdt = @import("crdt.zig");
```

Use `pub` to export a declaration from a module.

```zig
pub const Thing = struct {};

pub fn doThing() void {}
```

Use the module from another file:

```zig
const crdt = @import("crdt.zig");

const row = crdt.UserRow.init(allocator);
```

## Constants and variables

Use `const` when the binding does not change. Use `var` when the binding changes.

```zig
const max_fields = 200;
var count: usize = 0;
count += 1;
```

`const` does not make the pointed-to value immutable.

```zig
const row_ptr: *Row = &row;
row_ptr.count += 1;
```

## Types

Type names commonly use `PascalCase`.

```zig
const Version = i32;
const Name = []const u8;
```

Common types:

```zig
bool
u8
usize
i32
i64
[]const u8      // read-only byte slice, often a string
[]u8            // mutable byte slice
?T              // optional T
!T              // error union with T
*T              // pointer to T
```

## Structs

A struct groups named fields.

```zig
const Dot = struct {
    client_id: []const u8,
    version: i32,
};

const dot = Dot{
    .client_id = "client_1",
    .version = 1,
};
```

Methods are functions inside a struct. The first argument is usually `self`.

```zig
const Dot = struct {
    version: i32,

    fn isNewerThan(self: Dot, other: Dot) bool {
        return self.version > other.version;
    }
};
```

Call a method with dot syntax:

```zig
if (a.isNewerThan(b)) {
    // ...
}
```

Use `*T` when a method must change the struct.

```zig
const Counter = struct {
    value: usize,

    fn increment(self: *Counter) void {
        self.value += 1;
    }
};
```

## Enums

An enum is one value from a fixed set.

```zig
const Pick = enum {
    operation,
    row,
};

const pick = Pick.operation;
```

Use `switch` to handle enum values.

```zig
switch (pick) {
    .operation => {},
    .row => {},
}
```

## Tagged unions

A `union(enum)` stores one payload from a fixed set. `CRDTOperation` uses this pattern.

```zig
const Operation = union(enum) {
    set: struct {
        key: []const u8,
        value: i64,
    },
    remove: struct {
        key: []const u8,
    },
};
```

Create a value by selecting one tag.

```zig
const op = Operation{
    .set = .{
        .key = "age",
        .value = 31,
    },
};
```

Read it with `switch`.

```zig
switch (op) {
    .set => |set| {
        _ = set.value;
    },
    .remove => |remove| {
        _ = remove.key;
    },
}
```

## Functions

A function names its argument types and return type.

```zig
fn add(a: i32, b: i32) i32 {
    return a + b;
}
```

Use `void` when the function returns no value.

```zig
fn check(value: i32) void {
    std.debug.assert(value >= 0);
}
```

Use `!T` when the function can fail.

```zig
fn parseCount(text: []const u8) !usize {
    return try std.fmt.parseInt(usize, text, 10);
}
```

Use `try` to return an error to the caller.

```zig
const count = try parseCount("12");
```

Use `catch` to handle an error locally.

```zig
const count = parseCount("bad") catch 0;
```

## If and optionals

An optional has either a value or `null`.

```zig
const maybe_name: ?[]const u8 = "max";
```

Unwrap it with `if`.

```zig
if (maybe_name) |name| {
    std.debug.print("{s}\n", .{name});
} else {
    std.debug.print("missing\n", .{});
}
```

Use `.?` only when you know the value is not null.

```zig
const name = maybe_name.?;
```

## Loops

Use `while` for a simple loop.

```zig
var i: usize = 0;
while (i < 10) : (i += 1) {
    // use i
}
```

Use `for` for slices and arrays.

```zig
const items = [_]i32{ 1, 2, 3 };

for (items) |item| {
    _ = item;
}
```

Get the index by looping over a second range.

```zig
for (items, 0..) |item, index| {
    _ = item;
    _ = index;
}
```

Use `break` to stop a loop. Use `continue` to skip to the next item.

## Switch

`switch` must cover all possible values.

```zig
const ord = std.math.order(a, b);

return switch (ord) {
    .lt => -1,
    .eq => 0,
    .gt => 1,
};
```

## Defer

`defer` runs at the end of the current scope.

```zig
var map = std.StringHashMap(i32).init(allocator);
defer map.deinit();
```

Use it for cleanup that must happen after success or failure.

## Allocators and maps

Pass an allocator to data structures that allocate memory.

```zig
var map = std.StringHashMap(i32).init(allocator);
defer map.deinit();

try map.put("client_1", 1);
```

Read from a map with `get`.

```zig
if (map.get("client_1")) |version| {
    _ = version;
}
```

Iterate over a map with an iterator.

```zig
var iterator = map.iterator();
while (iterator.next()) |entry| {
    const key = entry.key_ptr.*;
    const value = entry.value_ptr.*;
    _ = key;
    _ = value;
}
```

## Tests

Tests live in the same file as the code they check.

```zig
test "adds numbers" {
    try std.testing.expectEqual(@as(i32, 3), add(1, 2));
}
```

Run all tests with:

```sh
zig build test
```

## Common builtins

Zig builtins start with `@`.

```zig
@as(i32, 1)           // type a value explicitly
@intFromBool(true)    // convert bool to integer
@min(a, b)
@max(a, b)
@import("std")
```

## Common project patterns

Use assertions for invariants.

```zig
const assert = std.debug.assert;
assert(value >= 0);
```

Use capacity checks before code that treats allocation failure as a bug.

```zig
assert(map.capacity() >= map.count() + 1);
```

Use `std.debug.panic` when an invariant failure reaches an impossible branch.

```zig
map.put(key, value) catch |err| {
    std.debug.panic("map capacity invariant violated: {}", .{err});
};
```
