# CRDT Database — IndexedDB Storage Layout

## Purpose

This document defines the internal IndexedDB layout for a CRDT-backed,
local-first database that supports:

- efficient queries (filters, ordering)
- iterators and streaming
- schema evolution without migrations (schema-less table creation)
- CRDT-correct synchronization

The design separates authoritative CRDT state from queryable canonical
state using compound-key single stores with custom indexes.

## API Overview

The database uses schema-less tables with upfront index declarations:

```typescript
const db = new CRDTDB("mydb", {
  indexes: {
    // Single-key indexes
    usersByAge: { table: "users", keys: ["age"] },
    postsByAuthor: { table: "posts", keys: ["authorId"] },
    postsByCreated: { table: "posts", keys: ["createdAt"] },
    
    // Compound index
    usersByFullName: { table: "users", keys: ["firstname", "lastname"] },
  },
});

// Set a row (rowKey is the first parameter)
await db.table("users").set("user_123", { name: "Alice", age: 30 });

// Get single item by rowKey (primary key)
const user: User | undefined = db.table("users").get("user_123");

// Get by index
const user: User | undefined = db
  .index("usersByFullName")
  .get(["kalle", "kula"]);

// Query multiple items
const userList: User[] = db.table("users").query(equals("user_123"));
const adults: User[] = db.index("usersByAge").query(above(18));

// Iterate with cursor
const iterator: AsyncIterator<User> = db.index("usersByAge").iterate(above(30));
for await (const user of iterator) {
  console.log(user);
}

// Transactions
await db.transaction(async (tx) => {
  const user = await tx.table("users").get("user_123");
  await tx
    .table("users")
    .set("user_123", { ...user, visits: user.visits + 1 });
});
```

**Key design principles:**

- Tables are schema-less (no upfront declaration needed for tables)
- Indexes must be declared in schema (accessing undeclared index = error)
- Single authoritative `crdt_rows` store with compound keys `[table, rowKey]`
- Single `materialized` store with compound keys for queryable data
- Custom index implementation using compound keys `[table, indexName, indexValue, rowKey]`

**Implementation Notes:**

- Underlying storage uses three single object stores (not per-table stores)
- Compound key structure enables efficient range scans within table boundaries
- Custom indexes ~2-3x slower than native IDB, but provide schema flexibility
- Transaction scope is fixed (always same 5 object stores), simplifying transactions
- API abstraction hides storage complexity from users

## High-Level Architecture

```
┌───────────────────────────────┐
│      CRDT Operations          │
│  (local + remote mutations)   │
└──────────┬────────────────────┘
           │ apply
           ▼
┌───────────────────────────────┐
│   crdt_rows (authoritative)   │
│   Key: [table, rowKey]        │
│   OR-Map + LWW + tombstones   │
│   (Single store, all tables)  │
└──────────┬────────────────────┘
           │ materialize
           ▼
┌───────────────────────────────┐
│   materialized (queryable)    │
│   Key: [table, rowKey]        │
│   Clean conflict-resolved     │
│   (Single store, all tables)  │
└──────────┬────────────────────┘
           │ indexed by
           ▼
┌───────────────────────────────┐
│   indexes (custom)            │
│   Key: [table, idx, val, key] │
│   Custom index implementation │
│   (Single store, all indexes) │
└───────────────────────────────┘
```

## Object Stores

This design uses **three single object stores** with compound keys instead of per-table stores.

### 1. crdt_rows (Authoritative State)

Role:

- Single source of truth for all tables
- Stores full CRDT metadata
- Participates in sync
- Never queried directly by users

Key:

```
[table: string, rowKey: string]
```

Examples:
- `["users", "user123"]`
- `["posts", "post456"]`

Value:

```typescript
ORMapRow {
  fields: Record<string, FieldState>
  tombstone?: {
    dot: Dot
    context: Record<clientId, counter>
  }
}
```

Properties:

- Contains dots, counters, tombstones
- Conflict resolution happens here
- Required for correctness
- Not optimized for access patterns
- Single object store with compound key for all tables
- Range scans within table: `IDBKeyRange.bound(["users"], ["users", []])`

### 2. materialized (Queryable State)

Role:

- Queryable, user-visible state for all tables
- Derived from crdt_rows
- Contains no CRDT metadata
- Persisted for performance
- Rebuildable from crdt_rows

Key:

```
[table: string, rowKey: string]
```

Examples:
- `["users", "user123"]`
- `["posts", "post456"]`

Value:

```typescript
Record<string, any>  // Clean, conflict-resolved data
```

Properties:

- Values are conflict-resolved (no CRDT metadata)
- Safe to read without CRDT logic
- Used by table queries (primary key lookups)
- May be dropped and rebuilt from crdt_rows
- Single store holds all tables' materialized data
- Range scans within table: `IDBKeyRange.bound(["users"], ["users", []])`

### 3. indexes (Custom Index Implementation)

Role:

- Accelerate filters, ordering, range queries
- Custom implementation (not native IndexedDB indexes)
- Never authoritative

Key:

```
[table: string, indexName: string, indexValue: any, rowKey: string]
```

Examples:
- `["users", "byAge", 30, "user123"]`
- `["users", "byFullName", ["kalle", "kula"], "user456"]`
- `["posts", "byAuthor", "user123", "post789"]`

Value:

```
null  // Key contains all necessary information
```

Properties:

- Four-part compound key enables efficient range scans
- Index entries point to rows in materialized store (two-step lookup)
- Maintained manually on writes (via `Promise.all` for parallelism)
- Single store holds all indexes for all tables
- Range query example: All users with age ≥ 30:
  - Range: `IDBKeyRange.bound(["users", "byAge", 30], ["users", "byAge", []])`
  - Returns keys like `["users", "byAge", 30, "user123"]`, `["users", "byAge", 35, "user456"]`, etc.
  - Extract `rowKey` from 4th component
  - Batch lookup in materialized store using keys `["users", "user123"]`, `["users", "user456"]`

**Performance vs Native Indexes:**

- Custom indexes: ~2-3x slower than native IndexedDB indexes
- Tradeoff: Flexibility (schema-less tables, fixed transaction scope) vs raw speed
- Point reads (primary key): Same O(1) performance as native approach
- Range queries: O(m + k) where m = matching index entries, k = row fetches

## Write Path (Local or Remote Operation)

```
1. Open transaction on all 5 object stores (fixed scope)
2. Load crdt_rows["table", "rowKey"]
3. applyOpToRow(row, op)
4. Save crdt_rows["table", "rowKey"]
5. Derive canonical value from row.fields
6. If tombstoned:
   - Delete materialized["table", "rowKey"]
   - Delete all index entries for this row
7. If not tombstoned:
   - Save materialized["table", "rowKey"] = canonicalValue
   - Update index entries in parallel:
     - For each declared index on this table:
       - Delete old: indexes["table", "indexName", oldValue, "rowKey"]
       - Insert new: indexes["table", "indexName", newValue, "rowKey"] = null
```

Invariant: All CRDT conflict resolution MUST complete before
materialization or indexing.

Notes:

- Transaction scope is always the same 5 object stores (crdt_rows, materialized, indexes, operations, clientState)
- Index updates can be parallelized using `Promise.all()`
- If materialization fails, entire transaction aborts (desirable)
- No dynamic store discovery problem (always same stores)

## Read / Query Path

### Point Read by Primary Key

```
1. Open transaction on materialized store
2. Direct key lookup: materialized.get(["table", "rowKey"])
3. Return value
```

Example: `db.table("users").get("user123")`

**Performance**: O(1) - Same as native IndexedDB approach

### Table Query by Primary Key

```
1. Open transaction on materialized store
2. Construct IDBKeyRange based on filter:
   - equals("id"): IDBKeyRange.only(["table", "id"])
   - above("id"): IDBKeyRange.bound(["table", "id"], ["table", []], false, true)
   - below("id"): IDBKeyRange.bound(["table"], ["table", "id"], true, false)
   - between("id1", "id2"): IDBKeyRange.bound(["table", "id1"], ["table", "id2"])
   - No filter: IDBKeyRange.bound(["table"], ["table", []])
3. Open cursor with range
4. Collect all values into array
5. Return array
```

Example: `db.table("users").query(above("user100"))`

**Performance**: 
- equals(): O(1) - Point lookup
- above/below/between(): O(m) where m = matching rows
- No filter: O(n) where n = all rows in table

### Index Query

```
1. Open transaction on indexes and materialized stores
2. Construct IDBKeyRange on indexes store:
   - equals(30): IDBKeyRange.bound(
       ["table", "indexName", 30],
       ["table", "indexName", 30, []]
     )
   - above(30): IDBKeyRange.bound(
       ["table", "indexName", 30],
       ["table", "indexName", []],
       false, true
     )
   - below(30): IDBKeyRange.bound(
       ["table", "indexName"],
       ["table", "indexName", 30],
       true, false
     )
   - between(30, 50): IDBKeyRange.bound(
       ["table", "indexName", 30],
       ["table", "indexName", 50, []]
     )
3. Open cursor on indexes store with range
4. Collect all rowKeys from 4th component of compound key
5. Batch fetch from materialized store:
   - For each rowKey: materialized.get(["table", rowKey])
6. Return array of values
```

Example: `db.index("byAge").query(above(30))`

**Performance**: O(m + k) where:
- m = number of matching index entries
- k = number of row fetches from materialized store
- Two-step lookup: indexes → materialized

### Iterator (Same as Query, but returns AsyncIterator)

- Same logic as query(), but yields values one at a time
- Useful for streaming large result sets
- Memory efficient (doesn't buffer entire array)

Example: `db.index("byAge").iterate(above(30))`

### Performance Comparison: Custom vs Native Indexes

| Operation | Custom (this design) | Native IDB Indexes | Notes |
|-----------|----------------------|-------------------|-------|
| Point read (primary key) | O(1) | O(1) | Same performance |
| Table query (primary key range) | O(m) | O(m) | Same performance |
| Index query (range) | O(m + k) | O(m) | Custom: 2-3x slower due to two-step lookup |
| Index maintenance | Manual | Automatic | Custom: requires explicit code, but parallelizable |

**Tradeoffs:**

- **Custom indexes are slower** for range queries (two-step vs one-step)
- **Custom indexes provide flexibility**:
  - Schema-less tables (no migrations for new tables)
  - Fixed transaction scope (no dynamic store discovery)
  - Single codebase for all index operations
- **Point reads unaffected**: Primary key lookups are equally fast

Guarantees:

- Queries never touch CRDT metadata
- Indexes never resolve conflicts
- CRDT state (`crdt_rows`) is never queried directly by user code
- All conflict resolution happens before materialization

## Deletions

- Deletions are represented as tombstones in crdt_rows
- Materialized row is removed from materialized store: `delete materialized["table", "rowKey"]`
- All index entries for that row are removed manually: `delete indexes["table", "indexName", value, "rowKey"]` for each index
- Tombstones remain authoritative in crdt_rows until GC

## Schema Definition

### User-Facing Schema

Indexes must be declared upfront in the CRDTDB constructor. Tables are schema-less and created implicitly:

```typescript
const db = new CRDTDB("mydb", {
  indexes: {
    // Format: indexName: { table, keys }
    usersByAge: { table: "users", keys: ["age"] },
    usersByFullName: { table: "users", keys: ["firstname", "lastname"] },
    postsByAuthor: { table: "posts", keys: ["authorId"] },
    postsByCreated: { table: "posts", keys: ["createdAt"] },
  },
});
```

**Key differences from per-table schema:**

- Tables are NOT declared upfront (schema-less)
- Indexes are declared at top level, not nested under tables
- Each index specifies which table it belongs to
- Tables are created implicitly when first row is written

### Resulting IndexedDB Structure

```
Object Store: crdt_rows
  Key: [table, rowKey]
  Value: ORMapRow (CRDT metadata)
  (Single authoritative store for all tables)

Object Store: materialized
  Key: [table, rowKey]
  Value: Record<string, any> (clean data)
  (Single queryable store for all tables)

Object Store: indexes
  Key: [table, indexName, indexValue, rowKey]
  Value: null
  (Single custom index store for all indexes)

Object Store: operations
  Key: auto-increment
  Value: Operation log for sync

Object Store: clientState
  Key: "clientId" | "logicalClock"
  Value: string | number
```

### Schema Rules

- **Tables are schema-less**: No upfront declaration needed, created on first write
- **Indexes must be declared upfront**: Accessing undeclared index throws error
- **Index names are global**: `usersByAge` must be unique across all indexes
- **Primary key parameter is `rowKey`**: User must provide unique keys per table (see below)
- **No auto-increment**: Not safe for distributed systems
- **Compound keys supported**: Indexes can have single or multiple keys

### Primary Key: `rowKey`

The primary key parameter is called `rowKey` and must be provided by the user for all operations:

**Type**: `ValidKey = string | number | symbol`

**Usage Examples**:

```typescript
// Set a row (rowKey is first parameter after table name)
await db.table("users").set("user_123", { name: "Alice", age: 30 });

// Get a row by rowKey
const user = await db.table("users").get("user_123");

// Delete a row by rowKey
await db.table("users").delete("user_123");

// Query by rowKey range
const users = await db.table("users").query(above("user_100"));
```

**Key Properties**:

- **User-provided**: Never auto-generated or auto-incremented
- **Unique per table**: Each table has its own namespace (e.g., `users` and `posts` can both have rowKey `"123"`)
- **Type flexibility**: Can be string, number, or symbol
- **Recommended**: Use UUIDs, ULIDs, or other globally unique identifiers for distributed safety
- **Internal storage**: Stored as compound key `[table, rowKey]` (e.g., `["users", "user_123"]`)
- **API abstraction**: User only sees simple `rowKey`, compound key is hidden

**Why User-Provided Keys?**

Auto-increment is not safe for distributed systems:
- Multiple clients could generate the same ID
- Conflicts would be frequent and hard to resolve
- User-provided UUIDs/ULIDs ensure global uniqueness across all clients

## Schema Evolution & Migrations

### Version Management

IndexedDB requires version bumps for schema changes. CRDTDB can:

1. **Hash-based versioning**: Automatically compute version from schema hash
2. **Explicit versioning**: User provides version number
3. **Hybrid**: User declares major version, library computes minor changes

Recommended: Hash-based for simplicity.

### Adding Indexes (Only Migration Needed)

Since tables are schema-less and the 5 core object stores are fixed, the only schema changes are:

1. **Adding new indexes**: Requires IndexedDB version bump
2. **Removing indexes**: Requires IndexedDB version bump

**Adding tables does NOT require migration** (they're created implicitly).

When adding an index, CRDTDB must:

1. Detect the change (compare current schema to stored schema)
2. Increment IndexedDB version
3. In `onupgradeneeded` event:
   - Do NOT modify object stores (they're fixed: crdt_rows, materialized, indexes, operations, clientState)
   - Rebuild index entries from materialized store
4. After migration completes, new index is queryable

Example migration:

```typescript
// Old schema (v1)
{
  indexes: {
    usersByAge: { table: "users", keys: ["age"] }
  }
}

// New schema (v2)
{
  indexes: {
    usersByAge: { table: "users", keys: ["age"] },
    usersByName: { table: "users", keys: ["name"] }  // NEW INDEX
  }
}

// Migration logic (in onupgradeneeded):
// Scan materialized store for "users" table and rebuild index
const tx = db.transaction(["materialized", "indexes"], "readwrite");
const materializedStore = tx.objectStore("materialized");
const indexesStore = tx.objectStore("indexes");

const range = IDBKeyRange.bound(["users"], ["users", []]);
const cursor = materializedStore.openCursor(range);

cursor.onsuccess = (e) => {
  const cursor = e.target.result;
  if (cursor) {
    const [table, rowKey] = cursor.key;
    const value = cursor.value;
    const indexValue = value.name; // Extract index field
    
    // Insert new index entry
    indexesStore.put(null, ["users", "usersByName", indexValue, rowKey]);
    cursor.continue();
  }
};
```

### Removing Indexes

When removing an index:

1. Increment IndexedDB version
2. In `onupgradeneeded`, scan and delete all entries for that index:
   ```typescript
   const range = IDBKeyRange.bound(
     ["users", "usersByName"],
     ["users", "usersByName", []]
   );
   const cursor = indexesStore.openCursor(range);
   cursor.onsuccess = (e) => {
     if (e.target.result) {
       e.target.result.delete();
       e.target.result.continue();
     }
   };
   ```

### Adding Tables (No Migration!)

**Key benefit of this architecture**: Adding a new table requires NO migration.

```typescript
// Simply start writing to a new table
await db.table("comments").set("comment1", { text: "Hello" });
// No version bump, no onupgradeneeded, no migration logic needed
```

This is possible because:
- crdt_rows, materialized, and indexes stores already support all tables via compound keys
- Tables are created implicitly when first row is written
- No per-table object stores to create

If you want to add indexes for the new table:

```typescript
// Update schema and trigger migration
const db = new CRDTDB("mydb", {
  indexes: {
    usersByAge: { table: "users", keys: ["age"] },
    commentsByAuthor: { table: "comments", keys: ["authorId"] }, // NEW
  },
});
// Migration rebuilds commentsByAuthor index from existing comments
```

### Rebuild from crdt_rows

Since `crdt_rows` is authoritative, you can always:

1. Clear materialized and indexes stores
2. Scan `crdt_rows` and re-materialize all data
3. Rebuild all index entries

This is useful for:

- Index corruption recovery
- Adding new indexes to existing data
- Major version upgrades
- Debugging

**Cost**: O(n × i) where n = total rows, i = number of indexes per table

## Rebuild Strategy

### Full Database Rebuild

```
1. Open transaction on crdt_rows, materialized, indexes (readwrite)
2. Clear materialized and indexes stores
3. Scan all crdt_rows entries:
   For each entry:
     a. Materialize canonical value from row.fields
     b. Skip if tombstoned
     c. Insert into materialized["table", "rowKey"] = value
     d. For each declared index on this table:
        - Extract index value(s) from materialized value
        - Insert indexes["table", "indexName", indexValue, "rowKey"] = null
4. Commit transaction

Note: Index inserts can be parallelized using Promise.all()
```

### Per-Table Rebuild

When a single table's indexes need rebuilding:

```typescript
async function rebuildTableIndexes(tableName: string) {
  const tx = db.transaction(["materialized", "indexes"], "readwrite");
  const materializedStore = tx.objectStore("materialized");
  const indexesStore = tx.objectStore("indexes");

  // Clear existing indexes for this table
  const deleteRange = IDBKeyRange.bound([tableName], [tableName, []]);
  await clearRange(indexesStore, deleteRange);

  // Scan materialized rows for this table
  const range = IDBKeyRange.bound([tableName], [tableName, []]);
  const cursor = await materializedStore.openCursor(range);

  while (cursor) {
    const [table, rowKey] = cursor.key;
    const value = cursor.value;

    // Rebuild all indexes for this row
    const indexUpdates = [];
    for (const [indexName, indexDef] of Object.entries(schema.indexes)) {
      if (indexDef.table === tableName) {
        const indexValue = extractIndexValue(value, indexDef.keys);
        indexUpdates.push(
          indexesStore.put(null, [table, indexName, indexValue, rowKey])
        );
      }
    }
    await Promise.all(indexUpdates);

    cursor = await cursor.continue();
  }
}
```

### When to Rebuild

- Schema migrations (new indexes added)
- Index corruption detected
- After bulk imports to `crdt_rows`
- Major version upgrades
- Development/debugging

### Performance

- **Cost**: O(n × i) where n = rows in table(s), i = indexes per row
- **Optimization**: Can be done in background
- **Correctness**: Always safe (crdt_rows is authoritative)

## Invariants (Non-Negotiable)

- `crdt_rows` is the only authoritative state
- `crdt_rows` uses compound key `[table, rowKey]` for all tables
- `materialized` uses compound key `[table, rowKey]` for all tables
- `indexes` uses compound key `[table, indexName, indexValue, rowKey]` for all indexes
- Fixed set of 5 object stores: `crdt_rows`, `materialized`, `indexes`, `operations`, `clientState`
- `materialized` and `indexes` contain no CRDT metadata (clean, conflict-resolved data only)
- All stores are rebuildable from `crdt_rows`
- Sync operates only on CRDT state and ops (never touches `materialized` or `indexes`)
- All conflict resolution happens in `crdt_rows` before materialization
- Tables are schema-less (created implicitly, no migrations needed for new tables)
- Indexes must be declared in schema (no dynamic index creation)
- Transaction scope is fixed (always same 5 stores, no dynamic discovery)

## Summary

This layout enables efficient filtering, ordering, iterators, and flexible schema evolution while preserving CRDT correctness and a single source of truth.

**Key Benefits:**

- **Schema-less tables**: Add new tables without migrations or version bumps
- **Fixed transaction scope**: Always same 5 stores, no dynamic discovery problem
- **Correctness**: All CRDT operations isolated in authoritative `crdt_rows` store
- **Maintainability**: Clear separation between CRDT logic and query logic
- **Flexibility**: Compound keys enable efficient range scans within table boundaries
- **Scalability**: Tables and indexes can be rebuilt independently

**Tradeoffs:**

- **Custom indexes are slower**: ~2-3x slower than native IndexedDB indexes for range queries
  - Reason: Two-step lookup (indexes → materialized) vs single-step native
  - Mitigation: Point reads (primary key) remain O(1), same as native
- **Manual index maintenance**: Must explicitly update index entries on writes
  - Benefit: Can parallelize using `Promise.all()`
  - Native approach: Automatic but sequential
- **Complexity**: More application code for index management
  - Benefit: Single codebase, predictable behavior across all tables

**Why This Design:**

The architecture prioritizes **flexibility and simplicity** over raw query performance:

1. **Schema-less tables** eliminate migration complexity for new tables
2. **Fixed transaction scope** eliminates IndexedDB's "dynamic store discovery" problem
3. **Single-store design** keeps transaction logic simple and predictable
4. **Point reads unaffected**: Most common operation (primary key lookup) remains O(1)
5. **Acceptable tradeoff**: 2-3x slower range queries are worth the flexibility for this use case

**Alternative Considered:**

Per-table object stores with native IndexedDB indexes would provide 2-3x faster range queries, but:

- Requires declaring all tables upfront (no schema-less tables)
- Creates unsolvable "dynamic store discovery" problem for transactions
- More complex transaction management (must know which stores to access beforehand)
- Not compatible with user's stated requirements (schema flexibility prioritized over raw speed)
