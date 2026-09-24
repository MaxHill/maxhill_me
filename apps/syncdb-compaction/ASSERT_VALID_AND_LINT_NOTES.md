# Assert-valid helpers and lint notes

There are two related problems in `apps/syncdb-compaction/src/crdt.zig`:

1. `assert(row.is_valid())` is too opaque when it fails.
2. The lint rule currently rejects good small helper functions because it requires two assertions in every function, not an average assertion density.

## Problem 1: `assert(row.is_valid())` is too opaque

This:

```zig
assert(row.is_valid());
```

is good in spirit but bad for debugging. If it fails, you only know:

> the row is invalid

You do **not** know whether:

- `table_name` is empty;
- `row_key` is empty;
- a field key is invalid;
- a field dot is invalid;
- the tombstone dot is invalid;
- the tombstone context is invalid.

TigerStyle usually solves this by **not asserting aggregate predicates**. Instead, write an `assert_valid()` function that contains **split assertions**.

So instead of:

```zig
fn is_valid(row: ORMapRow) bool {
    ...
}

assert(row.is_valid());
```

prefer:

```zig
fn assert_valid(row: ORMapRow) void {
    assert(row.table_name.len > 0);
    assert(row.row_key.len > 0);

    var fields = row.fields.iterator();
    while (fields.next()) |entry| {
        assert_field_key_valid(entry.key_ptr.*);
        entry.value_ptr.dot.assert_valid();
    }

    if (row.tombstone) |tombstone| {
        tombstone.dot.assert_valid();
        assert_context_valid(tombstone.context);
    }
}
```

Then callers use:

```zig
row.assert_valid();
```

Now a failure points at the exact failed line:

```zig
assert(row.row_key.len > 0);
```

or:

```zig
assert(entry.value_ptr.dot.version >= 0);
```

That is much more useful than `assert(row.is_valid())`.

The same applies to `Dot`.

Instead of:

```zig
fn is_valid(dot: @This()) bool {
    return dot.client_id.len > 0 and dot.version >= 0;
}
```

use:

```zig
fn assert_valid(dot: Dot) void {
    assert(dot.client_id.len > 0);
    assert(dot.version >= 0);
}
```

Then:

```zig
a.assert_valid();
b.assert_valid();
```

This also matches the TigerStyle advice to split compound assertions.

## When should `is_valid()` still exist?

Use `is_valid()` when invalid data is an **expected runtime possibility** and the caller must branch on it.

Example:

```zig
if (!operation.is_valid()) return error.InvalidOperation;
```

That makes sense at a decoding/parsing/API boundary.

But for internal invariants, prefer:

```zig
operation.assert_valid();
```

So the pattern is:

```zig
fn is_valid(value: T) bool {
    // Predicate for user/external data paths.
}

fn assert_valid(value: T) void {
    // Split assertions for internal invariant checks.
}
```

You do **not** need both everywhere. For this file, while learning TigerStyle, start with `assert_valid()`.

## Example shape for this file

### `Dot`

```zig
const Dot = struct {
    client_id: []const u8,
    version: i32,

    fn assert_valid(dot: Dot) void {
        assert(dot.client_id.len > 0);
        assert(dot.version >= 0);
    }

    fn equal(a: Dot, b: Dot) bool {
        a.assert_valid();
        b.assert_valid();

        return a.version == b.version and std.mem.eql(u8, a.client_id, b.client_id);
    }
};
```

This makes `equal()` clearer too: it assumes valid dots.

### Context

Instead of:

```zig
fn context_valid(context: std.StringHashMap(i32)) bool {
    ...
}
```

use:

```zig
fn assert_context_valid(context: std.StringHashMap(i32)) void {
    var iterator = context.iterator();
    while (iterator.next()) |entry| {
        assert(entry.key_ptr.*.len > 0);
        assert(entry.value_ptr.* >= 0);
    }
}
```

Again, if it fails, you know exactly why.

### `CRDTOperation`

```zig
const CRDTOperation = union(enum) {
    set: struct {
        table: []u8,
        row_key: []u8,
        field: ?[]u8,
        value: std.json.Value,
        dot: Dot,
    },
    set_row: struct {
        table: []u8,
        row_key: []u8,
        fields: ?[]u8,
        value: std.json.Value,
        dot: Dot,
    },
    remove: struct {
        table: []u8,
        row_key: []u8,
        dot: Dot,
        context: std.StringHashMap(i32),
    },

    fn assert_valid(operation: CRDTOperation) void {
        switch (operation) {
            .set => |set| {
                assert(set.table.len > 0);
                assert(set.row_key.len > 0);
                assert(set.field != null);
                assert(set.field.?.len > 0);
                set.dot.assert_valid();
            },
            .set_row => |set_row| {
                assert(set_row.table.len > 0);
                assert(set_row.row_key.len > 0);
                assert(set_row.fields == null);
                set_row.dot.assert_valid();
            },
            .remove => |remove| {
                assert(remove.table.len > 0);
                assert(remove.row_key.len > 0);
                remove.dot.assert_valid();
                assert_context_valid(remove.context);
            },
        }
    }
};
```

Then:

```zig
operation.assert_valid();
```

No aggregate boolean. Much better failure location.

### `ORMapRow`

```zig
const ORMapRow = struct {
    table_name: []const u8,
    row_key: ValidKey,
    fields: std.StringHashMap(LWWField),
    tombstone: ?struct {
        dot: Dot,
        context: std.StringHashMap(i32),
    },

    fn assert_valid(row: ORMapRow) void {
        assert(row.table_name.len > 0);
        assert(row.row_key.len > 0);

        var fields = row.fields.iterator();
        while (fields.next()) |entry| {
            assert_field_key_valid(entry.key_ptr.*);
            entry.value_ptr.dot.assert_valid();
        }

        if (row.tombstone) |tombstone| {
            tombstone.dot.assert_valid();
            assert_context_valid(tombstone.context);
        }
    }
};
```

And:

```zig
fn assert_field_key_valid(field: []const u8) void {
    assert(field.len > 0);
    assert(!std.mem.eql(u8, field, "_key"));
}
```

This tells you exactly which invariant failed.

## Problem 2: the lint rule is fighting good design

The lint test currently fails with errors like:

```text
function "is_valid" has 0 assertions. Minimum is 2 assertions.
function "equal" has 0 assertions. Minimum is 2 assertions.
function "value_type_rank" has 0 assertions. Minimum is 2 assertions.
function "compare_value_type" has 0 assertions. Minimum is 2 assertions.
function "compare_arrays" has 0 assertions. Minimum is 2 assertions.
function "next_object_key_after" has 0 assertions. Minimum is 2 assertions.
function "context_valid" has 0 assertions. Minimum is 2 assertions.
```

This is important: the lint rule is currently **stricter than TigerStyle**.

TigerStyle says:

> The assertion density of the code must average a minimum of two assertions per function.

It says **average**, not “every single function must have at least two assertions.”

That distinction matters.

A function like this does not naturally need two assertions:

```zig
fn value_type_rank(value: std.json.Value) u8 {
    return switch (value) {
        .null => 0,
        .bool => 1,
        .integer => 2,
        .float => 3,
        .number_string => 4,
        .string => 5,
        .array => 6,
        .object => 7,
    };
}
```

Adding two assertions here just to satisfy the lint rule would be worse style. It would be assertion theater.

So fix this in two ways.

## Lint fix A: count `assert_valid()` as an assertion at the call site

The lint currently counts literal calls like:

```zig
assert(...);
std.debug.assert(...);
```

But if you write:

```zig
row.assert_valid();
operation.assert_valid();
```

that should count as an assertion-like call.

TigerBeetle has similar patterns like:

```zig
budget.assert_invariants();
defer budget.assert_invariants();
```

Those are real assertions even though the word is not exactly `assert(...)`.

So update the lint rule to count calls whose callee is:

- `assert`
- `assert_valid`
- `assert_context_valid`
- `assert_field_key_valid`
- `assert_invariants`
- maybe any function beginning with `assert_`

Conceptually:

```zig
fn nameIsAssertLike(name: []const u8) bool {
    return std.mem.eql(u8, name, "assert") or
        std.mem.startsWith(u8, name, "assert_") or
        std.mem.eql(u8, name, "assert_valid") or
        std.mem.eql(u8, name, "assert_invariants");
}
```

Then in `calleeIsAssert()`, check `nameIsAssertLike(...)` instead of only checking equality with `"assert"`.

That way:

```zig
row.assert_valid();
```

counts.

## Lint fix B: change the floor from per-function to average density

This is the bigger one.

Current behavior:

> every named function must have at least two assertions.

TigerStyle behavior:

> the code should average at least two assertions per function.

So the lint should collect:

```text
total_assertions
total_functions
```

Then check:

```zig
total_assertions >= total_functions * min_assertions_per_function
```

That lets tiny pure helpers exist without fake assertions, as long as the file/module has enough assertion density overall.

You can still keep special targeted checks for suspicious cases later, but the base density rule should be average-based.

## Recommended approach

Do both:

1. Replace `is_valid()` internal invariant checks with `assert_valid()` split assertions.
2. Update the lint to:
   - count `assert_*` / `.assert_valid()` / `.assert_invariants()` calls;
   - enforce assertion density as an average, not per function.

That gives the behavior you actually want:

- assertions are debuggable;
- the lint rewards invariant helper functions;
- small pure functions are not forced to contain fake assertions;
- the rule matches TigerStyle more closely.

## What not to do

Do **not** add meaningless assertions like this just to pass lint:

```zig
fn value_type_rank(value: std.json.Value) u8 {
    assert(true);
    assert(@sizeOf(std.json.Value) > 0);
    return switch (value) { ... };
}
```

That trains the wrong muscle.

The goal is not “make the linter green.” The goal is:

> encode real assumptions where they belong.

If the linter rejects good code, change the linter.
