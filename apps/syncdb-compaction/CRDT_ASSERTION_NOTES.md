# CRDT assertion notes

A good TigerStyle way to read `apps/syncdb-compaction/src/crdt.zig` is:

> Every function has a small contract. Assertions are the executable form
> of that contract.

For this file, the main hidden contracts are about:

- dot validity;
- deterministic ordering;
- CRDT visibility rules;
- map/key ownership and lifetime;
- capacity and allocation expectations;
- whether equality is allowed or considered protocol corruption.

## First: type-level invariants

### `Dot`

```zig
const Dot = struct {
    client_id: []const u8,
    version: i32,
};
```

Likely invariants:

```zig
assert(dot.client_id.len > 0);
assert(dot.version >= 0); // or > 0, but choose one.
```

Open question: versions in tests use `0`, but `apply_operation_to_row()`
asserts `operation.dot.version > 0`. That is a domain mismatch.

Before adding assertions, decide:

- Is version `0` valid?
- Is version `1` the first real operation?
- Is `i32` correct, or should this be `u64`/`u128`?

For CRDT clocks, I would expect an unsigned monotonic type unless
compatibility forces `i32`.

TigerStyle thought: make this explicit with a helper:

```zig
fn assert_dot_valid(dot: Dot) void {
    assert(dot.client_id.len > 0);
    assert(dot.version >= 0);
}
```

Then call it at boundaries.

### `CRDTOperation`

```zig
const CRDTOperation = union(enum) {
    set: struct { ... },
    set_row: struct { ... },
    remove: struct { ... },
};
```

Likely invariants:

For all operations:

```zig
assert(table.len > 0);
assert(row_key.len > 0);
assert_dot_valid(dot);
```

For `set`:

```zig
assert(field != null);
assert(field.?.len > 0);
```

For `set_row`:

```zig
// Decide what `field` means here.
// If set_row replaces the whole row, field probably must be null.
assert(field == null);
```

For `remove`:

```zig
// Context contains observed dots.
// Each context version should be valid.
for (context.values()) |version| {
    assert(version >= 0);
}
```

Big assumption: `context` is probably a vector clock-ish structure:
`client_id -> max observed version`. If so, the real invariant is stronger:

```zig
// Tombstone context versions are monotonic.
// Remove observes exactly the dots it deletes, or at least a superset.
```

That may not be assertable locally yet, but it should be documented in
code.

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
};
```

Likely invariants:

```zig
assert(row.table_name.len > 0);
assert(row.row_key.len > 0);
```

For fields:

```zig
for (row.fields.iterator()) |entry| {
    assert(entry.key_ptr.*.len > 0);
    assert(!std.mem.eql(u8, entry.key_ptr.*, "_key"));
    assert_dot_valid(entry.value_ptr.dot);
}
```

That `_key` assertion matters because `to_user_row()` injects `_key`. If a
CRDT field is also named `_key`, the function’s postcondition breaks.

For tombstone:

```zig
if (row.tombstone) |tombstone| {
    assert_dot_valid(tombstone.dot);
    for (tombstone.context.values()) |version| {
        assert(version >= 0);
    }
}
```

Possible CRDT invariant:

```zig
// No visible field may be causally dominated by the tombstone.
```

Something like:

```zig
if (row.tombstone) |tombstone| {
    for (row.fields.iterator()) |field| {
        const field_dot = field.value_ptr.dot;
        const observed = tombstone.context.get(field_dot.client_id) orelse -1;
        assert(field_dot.version > observed);
    }
}
```

That depends on intended OR-Map semantics, but this is the type of
invariant worth looking for.

## `to_user_row`

```zig
pub fn to_user_row(out: *UserRow, row: ORMapRow) !bool {
    assert(out.count() == 0);
    assert(out.capacity() >= row.fields.count() + 1);

    if (row.fields.count() == 0) {
        return false;
    }

    try out.put("_key", .{ .string = row.row_key });

    var iterator = row.fields.iterator();
    while (iterator.next()) |field| {
        try out.put(field.key_ptr.*, field.value_ptr.value);
    }

    assert(out.count() == row.fields.count() + 1);
    return true;
}
```

### Current good assertions

```zig
assert(out.count() == 0);
```

Good precondition. The function assumes it is constructing into an empty
output map.

```zig
assert(out.capacity() >= row.fields.count() + 1);
```

This says: caller must preallocate enough capacity. That is a good contract
if the function wants to avoid allocation.

```zig
assert(out.count() == row.fields.count() + 1);
```

Good postcondition.

### Hidden assumptions

1. `row.fields` does not contain `_key`.

If it does, this happens:

```zig
try out.put("_key", .{ .string = row.row_key });
try out.put("_key", field_value);
```

Then `out.count()` will not be `row.fields.count() + 1`.

So an explicit assertion would be useful:

```zig
assert(!row.fields.contains("_key"));
```

Or inside the loop:

```zig
assert(!std.mem.eql(u8, field.key_ptr.*, "_key"));
```

2. `row.row_key` is valid.

```zig
assert(row.row_key.len > 0);
```

3. `row.fields` contains only visible fields.

This function assumes deletion/tombstone filtering already happened. It
does not check whether a field is dominated by the tombstone. That is fine,
but then the function contract is:

> `row.fields` contains only user-visible fields.

You can assert that with an `assert_row_valid(row)` helper if the semantics
are clear.

4. Empty `fields` is a normal case.

This is correctly not asserted. The function returns `false`.

TigerStyle lesson: do not assert normal domain outcomes. Assert broken
contracts.

### Good additional assertions

```zig
assert(row.row_key.len > 0);
assert(!row.fields.contains("_key"));
```

Maybe:

```zig
assert(row.table_name.len > 0);
```

Maybe postcondition after false branch:

```zig
if (row.fields.count() == 0) {
    assert(out.count() == 0);
    return false;
}
```

That is a nice small postcondition.

## `apply_operation_to_row`

```zig
pub fn apply_operation_to_row(row: ORMapRow, operation: CRDTOperation) null {
    assert(row.fields.count() > 0);
    assert(operation.dot.version > 0);
}
```

This is currently more of a sketch.

### Current suspicious assertion

```zig
assert(row.fields.count() > 0);
```

This may be wrong for a CRDT.

Applying a `set` to an empty row is probably how a row is created. Applying
a `remove` to an already-empty row may also be normal/idempotent.

So this assertion depends on the intended function contract:

- If this function only applies operations to an already-visible row, the
  assertion is okay.
- If this is the general CRDT apply function, it is too strong.

TigerStyle question to ask:

> Is an empty row corrupt, or is it a normal state?

For an OR-Map, empty row usually sounds normal.

### Current version assertion

```zig
assert(operation.dot.version > 0);
```

This conflicts with test data where `Dot.version = 0`.

Pick one:

- If `0` means initial/local seed, assert `>= 0`.
- If operation dots must start at `1`, update tests/fixtures and assert
  `> 0`.

### Better preconditions

This function should probably assert operation/row identity alignment:

```zig
switch (operation) {
    .set => |op| {
        assert(std.mem.eql(u8, op.table, row.table_name));
        assert(std.mem.eql(u8, op.row_key, row.row_key));
        assert(op.field != null);
        assert(op.field.?.len > 0);
        assert_dot_valid(op.dot);
    },
    .set_row => |op| {
        assert(std.mem.eql(u8, op.table, row.table_name));
        assert(std.mem.eql(u8, op.row_key, row.row_key));
        assert(op.field == null); // if this is intended
        assert_dot_valid(op.dot);
    },
    .remove => |op| {
        assert(std.mem.eql(u8, op.table, row.table_name));
        assert(std.mem.eql(u8, op.row_key, row.row_key));
        assert_dot_valid(op.dot);
        assert_context_valid(op.context);
    },
}
```

### Postconditions worth asserting

For CRDT apply functions, postconditions are the important part:

- Applying the same operation twice is idempotent.
- A remove deletes only fields it has observed.
- Concurrent set after unseen remove remains visible.
- Tombstone context never moves backward.
- Field dot never moves backward according to the chosen order.
- Row key/table name do not change.

Examples:

```zig
defer assert_row_valid(row);
```

If row is mutable:

```zig
assert_row_valid(row);
defer assert_row_valid(row);
```

This is very TigerStyle: assert before and after mutation.

## `compare_dots`

```zig
pub fn compare_dots(a: Dot, b: Dot) std.math.Order {
    assert(a.client_id != b.client_id);
    if (a.version != b.version) {
        return a.version - b.version;
    }

    const order = (std.math.order(u8, a.client_id, b.client_id));

    assert(order != .eq);
    return order;
}
```

This function has several important assumptions.

### Intended invariant

It seems intended to produce a deterministic order for dots:

1. compare by version;
2. if versions equal, compare by client id;
3. equal dots are not allowed.

That contract should be made explicit.

### Current assertion is probably wrong

```zig
assert(a.client_id != b.client_id);
```

Problems:

1. If two dots are from the same client but different versions, comparing
   them should be valid.
2. For slices, you probably want byte equality, not pointer/slice identity.
3. The assertion should likely reject identical dots, not same-client dots.

Better:

```zig
assert_dot_valid(a);
assert_dot_valid(b);
assert(!dots_equal(a, b));
```

Where:

```zig
fn dots_equal(a: Dot, b: Dot) bool {
    return a.version == b.version and std.mem.eql(u8, a.client_id, b.client_id);
}
```

Then:

```zig
pub fn compare_dots(a: Dot, b: Dot) std.math.Order {
    assert_dot_valid(a);
    assert_dot_valid(b);
    assert(!dots_equal(a, b));

    const version_order = std.math.order(a.version, b.version);
    if (version_order != .eq) return version_order;

    const client_order = std.mem.order(u8, a.client_id, b.client_id);
    assert(client_order != .eq);
    return client_order;
}
```

### Another issue: subtraction

```zig
return a.version - b.version;
```

For TigerStyle, prefer:

```zig
return std.math.order(a.version, b.version);
```

Subtraction can overflow and does not clearly say “ordering”.

### Bigger semantic question

There are two different concepts:

1. **causal comparison**: same client/version vector semantics;
2. **deterministic total ordering**: used for LWW tie-breaking.

If this function is total ordering, name it accordingly:

```zig
compare_dots_total()
```

If it is causal comparison, then different clients are concurrent and
should not return `.lt`/`.gt`.

## `tiebreak_compare_values`

```zig
pub fn tiebreak_compare_values(a: std.json.Value, b: std.json.Value) std.math.Order {
    var ord = type_compare(a, b);
    if (ord != .eq) return ord;

    ord = switch (a) {
        .null => .eq,
        .bool => |a_bool| std.math.order(@intFromBool(a_bool), @intFromBool(b.bool)),
        .integer => |a_integer| std.math.order(a_integer, b.integer),
        .float => |a_float| std.math.order(a_float, b.float),
        .number_string => |a_number_string| std.mem.order(u8, a_number_string, b.number_string),
        .string => |a_string| std.mem.order(u8, a_string, b.string),
        .array => |a_array| compare_arrays(a_array, b.array),
        .object => |a_object| compare_objects(a_object, b.object),
    };

    assert(ord != .eq);
    return ord;
}
```

### Current contract

This function says:

> I am only called when `a` and `b` must not be equal. If they compare
> equal, something is corrupt.

That is what this assertion says:

```zig
assert(ord != .eq);
```

This is a valid TigerStyle assertion if equality really is protocol
corruption.

But the name should make that contract obvious. Maybe:

```zig
compare_values_unequal()
```

or:

```zig
tiebreak_compare_distinct_values()
```

### Hidden assumptions

1. `type_compare(a, b) == .eq` means it is safe to access `b.bool`,
   `b.integer`, etc.

That is true because `type_compare` ranks by tag.

2. Floats are deterministic and not NaN.

If JSON values can be constructed internally, not only parsed from JSON,
you may want:

```zig
.float => |a_float| {
    assert(!std.math.isNan(a_float));
    assert(!std.math.isNan(b.float));
    return std.math.order(a_float, b.float);
},
```

3. Recursion is bounded.

This function recurses through arrays/objects:

```zig
.array => compare_arrays(...)
.object => compare_objects(...)
```

TigerStyle usually avoids recursion or puts a limit on it. There is already
a TODO:

```zig
// TODO: remove recursion
```

Until then, the hidden invariant is:

> JSON nesting depth is small enough not to blow the stack.

That is an assumption worth making explicit. Either pass a depth counter:

```zig
assert(depth < json_depth_max);
```

or rewrite iteratively.

### Important bug/assumption conflict

`compare_arrays()` calls `tiebreak_compare_values()` for each element.

That means this will assert:

```json
[1, 2] vs [1, 3]
```

because the first elements are equal:

```zig
tiebreak_compare_values(1, 1) // asserts ord != .eq
```

So there are really two functions needed:

1. a normal comparator that may return `.eq`;
2. a tiebreak wrapper that asserts the final result is not `.eq`.

For example:

```zig
fn compare_values(a: std.json.Value, b: std.json.Value) std.math.Order {
    // May return .eq.
}

pub fn tiebreak_compare_values(a: std.json.Value, b: std.json.Value) std.math.Order {
    const order = compare_values(a, b);
    assert(order != .eq);
    return order;
}
```

Then `compare_arrays()` and `compare_objects()` should call
`compare_values()`, not the tiebreaking wrapper.

That is a perfect example of finding an invariant:

- `tiebreak_compare_values()` assumes unequal inputs.
- `compare_arrays()` cannot guarantee unequal elements.
- Therefore the assertion belongs one level higher.

## `value_type_rank`

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

This is simple but important. If this order affects conflict resolution, it
is a protocol invariant.

Assumptions:

- The type order is stable forever.
- All replicas use the same order.
- This order is arbitrary but deterministic.

Good tests would lock this down.

Possible assertion in tests or comptime:

```zig
assert(value_type_rank(.null) == 0);
assert(value_type_rank(.{ .bool = false }) == 1);
```

But the exhaustive switch already helps.

## `type_compare`

```zig
pub fn type_compare(a: std.json.Value, b: std.json.Value) std.math.Order {
    return std.math.order(value_type_rank(a), value_type_rank(b));
}
```

Contract:

- Compares JSON tags only.
- Does not compare values.
- Returns `.eq` iff the two values have the same JSON variant.

Possible assertion? Not much needed here. This is already clear.

Maybe rename if you want precision:

```zig
compare_value_type()
```

## `compare_arrays`

```zig
fn compare_arrays(a: std.json.Array, b: std.json.Array) std.math.Order {
    const n = @min(a.items.len, b.items.len);
    var i: usize = 0;
    while (i < n) : (i += 1) {
        const o = tiebreak_compare_values(a.items[i], b.items[i]); // TODO: remove recursion
        if (o != .eq) return o;
    }
    return std.math.order(a.items.len, b.items.len);
}
```

### Contract

Lexicographic array comparison:

1. compare first element;
2. if equal, compare next element;
3. if all equal up to shorter length, shorter array is less.

### Current broken assumption

As mentioned above, this calls a comparator that asserts values cannot be
equal. But lexicographic comparison must allow equal prefixes.

So this function assumes:

> No two arrays being compared have equal elements at the same index before
> the first differing element.

That is not a valid JSON assumption.

Use a non-asserting comparator inside this function.

### Useful assertions

```zig
assert(i <= n);
assert(n <= a.items.len);
assert(n <= b.items.len);
```

Those are mechanically true, but not very valuable.

More useful would be a recursion/depth bound if values are externally
controlled.

## `next_object_key_after`

```zig
fn next_object_key_after(object_map: std.json.ObjectMap, previous_key: ?[]const u8) ?[]const u8 {
    var iterator = object_map.iterator();
    var best: ?[]const u8 = null;

    while (iterator.next()) |entry| {
        const key = entry.key_ptr.*;
        if (previous_key) |previous| {
            if (std.mem.order(u8, key, previous) != .gt) continue;
        }
        if (best == null or std.mem.order(u8, key, best.?) == .lt) {
            best = key;
        }
    }
    return best;
}
```

### Contract

Returns the smallest object key greater than `previous_key`.

Assumptions:

- Object keys are stable while this function runs.
- Object is not mutated during iteration.
- Byte order is the desired canonical key order.
- Duplicate keys cannot exist because `ObjectMap` enforces uniqueness.

Useful assertions:

```zig
if (previous_key) |previous| {
    if (best) |key| {
        assert(std.mem.order(u8, key, previous) == .gt);
    }
}
```

You could also assert the minimality of `best`, but that requires another
loop. Since this function is already O(n), doing another O(n) check might
be okay in tests but maybe not production.

This is a good candidate for `constants.verify` style later:

```zig
if (verify) assert_next_object_key_after_result(object_map, previous_key, best);
```

## `compare_objects`

```zig
fn compare_objects(a: std.json.ObjectMap, b: std.json.ObjectMap) std.math.Order {
    var previous: ?[]const u8 = null;

    while (true) {
        const ka = next_object_key_after(a, previous);
        const kb = next_object_key_after(b, previous);

        if (ka == null and kb == null) return .eq;
        if (ka == null) return .lt;
        if (kb == null) return .gt;

        const ko = std.mem.order(u8, ka.?, kb.?);
        if (ko != .eq) return ko;

        const va = a.get(ka.?) orelse unreachable;
        const vb = b.get(kb.?) orelse unreachable;

        const vo = tiebreak_compare_values(va, vb);
        if (vo != .eq) return vo;

        previous = ka.?;
    }
}
```

### Contract

Canonical lexicographic object comparison:

1. keys are compared in sorted byte order;
2. missing key sorts before present key;
3. if keys equal, compare values;
4. continue until difference or equality.

### Hidden assumptions

1. Same equal-prefix problem as arrays.

If two objects have same first key and equal first value, this calls:

```zig
tiebreak_compare_values(equal_value, equal_value)
```

and asserts.

So again, `compare_objects()` should call a normal comparator that can
return `.eq`.

2. The loop terminates.

It should terminate because `previous` advances to `ka`, and
`next_object_key_after()` returns keys greater than previous.

That invariant can be asserted:

```zig
if (previous) |p| {
    assert(std.mem.order(u8, ka.?, p) == .gt);
    assert(std.mem.order(u8, kb.?, p) == .gt);
}
```

3. Returned keys exist in their maps.

Currently:

```zig
const va = a.get(ka.?) orelse unreachable;
```

This is okay because `ka` came from `a`, but TigerStyle might prefer:

```zig
const va = a.get(ka.?) orelse {
    assert(false);
    unreachable;
};
```

Or just keep `unreachable`; this is a data-structure impossibility.

4. Object size is bounded.

This function is O(n²), intentionally. The comment says that is okay
because most values should be tie-broken earlier.

That is a performance assumption. If JSON objects can be large and
adversarial, this can become expensive. TigerStyle would ask for a bound:

```zig
assert(a.count() <= object_fields_max);
assert(b.count() <= object_fields_max);
```

if such a max exists.

## The biggest learning point in this file

The file has a useful pattern and one important trap.

### Useful pattern

`tiebreak_compare_values()` has a strong postcondition:

```zig
assert(ord != .eq);
```

That is TigerStyle: if equal values would break protocol assumptions, crash
early.

### Trap

That assertion is in a function reused by recursive comparison helpers. But
those helpers need equality to be allowed for sub-values.

So the assertion is at the wrong layer.

The better design is:

```zig
fn compare_values(a: std.json.Value, b: std.json.Value) std.math.Order {
    // Can return .eq.
}

pub fn tiebreak_compare_values(a: std.json.Value, b: std.json.Value) std.math.Order {
    const order = compare_values(a, b);
    assert(order != .eq);
    return order;
}
```

Then:

```zig
compare_arrays()  -> calls compare_values()
compare_objects() -> calls compare_values()
public tiebreak   -> asserts final result != .eq
```

That is exactly the kind of distinction TigerStyle tries to force:

- what can this helper guarantee?
- what does this caller know?
- where is the narrowest correct place to assert?

## A practical TigerStyle recipe for this file

When you wonder “what can I assert?”, ask these in order.

### 1. What is this function’s input contract?

Example:

```zig
to_user_row(out, row)
```

Input contract:

```zig
assert(out.count() == 0);
assert(out.capacity() >= row.fields.count() + 1);
assert(row.row_key.len > 0);
assert(!row.fields.contains("_key"));
```

### 2. What state is impossible if the previous layer did its job?

Example:

```zig
apply_operation_to_row(row, operation)
```

Impossible if routing is correct:

```zig
assert(operation.table == row.table_name);
assert(operation.row_key == row.row_key);
```

Use `std.mem.eql`, not pointer equality.

### 3. What must be true after the function returns?

Example:

```zig
to_user_row()
```

Postconditions:

```zig
assert(out.count() == row.fields.count() + 1);
assert(out.contains("_key"));
```

### 4. What invariant must survive mutation?

For future `apply_operation_to_row()`:

```zig
assert_row_valid(row);
defer assert_row_valid(row);
```

This is one of the most useful TigerStyle habits.

### 5. What is normal invalid input vs programmer error?

Normal:

- row has no visible fields;
- remove operation targets absent field;
- duplicate operation arrives again;
- stale operation arrives.

Do not assert these if CRDT semantics say they are allowed. Handle them.

Programmer/protocol error:

- empty client id;
- invalid version;
- operation routed to wrong table/row;
- field named reserved `_key`;
- tombstone context has negative versions;
- equal values reach a function whose whole purpose is to order distinct
  values.

Assert these.

## Concrete assertion helpers I would add first

Not necessarily implementing now, but these are the shapes I would reach
for:

```zig
fn assert_dot_valid(dot: Dot) void {
    assert(dot.client_id.len > 0);
    assert(dot.version >= 0);
}

fn assert_context_valid(context: std.StringHashMap(i32)) void {
    var iterator = context.iterator();
    while (iterator.next()) |entry| {
        assert(entry.key_ptr.*.len > 0);
        assert(entry.value_ptr.* >= 0);
    }
}

fn assert_field_key_valid(field: []const u8) void {
    assert(field.len > 0);
    assert(!std.mem.eql(u8, field, "_key"));
}

fn assert_row_valid(row: ORMapRow) void {
    assert(row.table_name.len > 0);
    assert(row.row_key.len > 0);

    var fields = row.fields.iterator();
    while (fields.next()) |entry| {
        assert_field_key_valid(entry.key_ptr.*);
        assert_dot_valid(entry.value_ptr.dot);
    }

    if (row.tombstone) |tombstone| {
        assert_dot_valid(tombstone.dot);
        assert_context_valid(tombstone.context);
    }
}
```

Then each public function starts with the relevant one.

## Summary

In this file, the best assertion candidates are:

- dot validity: non-empty client id, valid version;
- operation shape: table/row/field validity per variant;
- row shape: non-empty table/key, no reserved `_key` field;
- tombstone/context validity;
- output map preconditions and postconditions;
- deterministic comparison postconditions;
- no equality at the public tiebreak layer;
- recursion/object-size bounds if JSON values are externally controlled;
- before/after row invariants around CRDT mutation.

The main assertion smell is that `tiebreak_compare_values()` asserts
inequality but is used by lower-level array/object comparison code that
must allow equal prefixes. That is a good example of learning where an
assertion belongs: assert at the layer that actually owns the assumption.
