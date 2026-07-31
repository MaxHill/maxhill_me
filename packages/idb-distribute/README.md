k CRDT Database — IndexedDB Storage Layout

## Invariants and known limitations

### Client IDs MUST be globally unique per tenant

**In normal use you do not need to think about this.** The library mints a
fresh `clientId` via `crypto.randomUUID` the first time a database is
opened and persists it in IndexedDB. This section only applies if you
override client identity — e.g. by passing `withClientId(...)`
on the builder or by constructing the underlying classes manually (as the
simulator and tests do).

The sync protocol identifies each operation by a `dot = (clientId, version)`.
The server enforces per-tenant uniqueness: within the same tenant
(`dbName + userId` on the server), any two operations with the same
`(clientId, version)` **must** have identical payloads. Any divergence is
treated as a CRDT consistency violation and the server rejects the request
(currently: process crash / 500 in dev).

Implications callers must respect:

- Do not reuse a `clientId` across independent replicas that write into the
  same tenant. Two browser tabs, two devices, two simulator instances, etc.
  must each have a distinct `clientId`.
- Do not seed `clientId` deterministically from `dbName` alone. If two
  replicas ever share a `dbName` (and a user), they will collide.
- Do not "reset local state" by wiping IndexedDB and keeping the old
  `clientId`. Treat client identity as tied to the local persistent store;
  wiping state should mint a new `clientId`.
- `withClientId(...)` exists for tests/simulators only. In production, let
  the default (`crypto.randomUUID`) run so identity is unique by
  construction.

Design note: the server intentionally fails loud on `clientId` reuse. This
downgrades what would otherwise be a silent **correctness** bug
(different operations sharing a dot, converging incorrectly across
replicas) into a visible **availability** bug (sync request rejected).
That trade-off is deliberate — do not "fix" it by making the server
tolerant of colliding dots.

## Implementation Status

### ✅ Completed

- **CRDT Operations**: Full LWW (Last-Write-Wins) and OR-Map support with
  tombstones
- **Sync Protocol**: Client-server synchronization with operation logs
- **Index Creation**: Native IndexedDB indexes on CRDT fields
  - Single-field indexes
  - Compound indexes (multiple fields)
  - Automatic index maintenance on writes
  - Full validation of index definitions

### 🚧 In Progress / Planned

- **Query API**: Index-based querying (query filters, cursors, etc.)
- **Materialized Views**: Separate queryable data store
- **Custom Index Store**: Flexible index implementation beyond native IDB

### Current Index Usage

Indexes can be created at database initialization:

```typescript
import { CRDTDatabase } from "@maxhill/idb-distribute";

const db = new CRDTDatabase(
  "mydb",
  {
    usersByAge: { table: "users", keys: ["age"] },
    usersByName: { table: "users", keys: ["firstName", "lastName"] },
  },
  "http://sync.example.com",
);

await db.open();
await db.setRow("users", "u1", {
  age: 30,
  firstName: "Alice",
  lastName: "Smith",
});
```

See [EXAMPLE_INDEXES.md](./EXAMPLE_INDEXES.md) for detailed usage examples.

---

## API Design (Proposed)

This section documents the proposed builder pattern API. The current implementation uses a different pattern (see "Current API" section below).

### Setup

```typescript
import { CRDTDatabase, above, below, exact } from "@maxhill/idb-distribute";

const db = new CRDTDatabase("mydb", {
  usersByAge: { table: "users", keys: ["age"] },
  postsByAuthor: { table: "posts", keys: ["authorId"] },
  postsByCreated: { table: "posts", keys: ["createdAt"] },
  usersByFullName: { table: "users", keys: ["firstName", "lastName"] },
});

await db.open();

// Get a table reference
const users = db.table("users");
const posts = db.table("posts");
```

### Write Operations

```typescript
// Set a complete row
await users.setRow("user_123", { 
  firstName: "Alice",
  lastName: "Smith", 
  age: 30,
  email: "alice@example.com"
});

// Update a single field
await users.setCell("user_123", "email", "newemail@example.com");

// Delete a row
await users.deleteRow("user_123");
```

### Read Operations

```typescript
// Get single row by primary key
const user = await users.get("user_123");
// Returns: { firstName: "Alice", lastName: "Smith", age: 30, ... } | undefined

// Query all rows in table
for await (const user of users.query()) {
  console.log(user);
}

// Query with primary key condition
for await (const user of users.query(above("user_100"))) {
  console.log(user);
}

for await (const user of users.query(below("user_999"))) {
  console.log(user);
}

for await (const user of users.query(exact("user_123"))) {
  console.log(user);
}
```

### Index Queries

```typescript
// Query all rows via index
for await (const user of users.index("usersByAge").query()) {
  console.log(user);
}

// Query with index condition
for await (const user of users.index("usersByAge").query(above(18))) {
  console.log(`Adult: ${user.firstName}, age ${user.age}`);
}

for await (const user of users.index("usersByAge").query(below(13))) {
  console.log(`Child: ${user.firstName}, age ${user.age}`);
}

// Compound index query
for await (const user of users.index("usersByFullName").query(exact(["Alice", "Smith"]))) {
  console.log(user);
}
```

### Query Operators

```typescript
import { exact, above, below, between } from "@maxhill/idb-distribute";

exact(value)
above(value)
above(value, { inclusive: true })
below(value)
below(value, { inclusive: true })
between(lower, upper)
between(lower, upper, { lowerInclusive: true, upperInclusive: true })
```

---

## Current API

The currently implemented API uses table name as first parameter:

```typescript
// Current implementation
await db.setRow("users", "user_123", { name: "Alice", age: 30 });
await db.setCell("users", "user_123", "email", "new@example.com");
const user = await db.get("users", "user_123");
await db.deleteRow("users", "user_123");

// Query by index
for await (const user of db.query("users", "usersByAge", above(18))) {
  console.log(user);
}

// Get all rows
const allUsers = await db.getAllRows("users");
```

**Key design principles:**

- Tables are schema-less (no upfront declaration needed for tables)
- Indexes must be declared in schema (accessing undeclared index = error)
- Single authoritative `crdt_rows` store with compound keys
  `[table, rowKey]`
- Single `materialized` store with compound keys for queryable data
- Custom index implementation using compound keys
  `[table, indexName, indexValue, rowKey]`

**Implementation Notes:**

- Underlying storage uses three single object stores (not per-table stores)
- Compound key structure enables efficient range scans within table
  boundaries
- Custom indexes ~2-3x slower than native IDB, but provide schema
  flexibility
- Transaction scope is fixed (always same 5 object stores), simplifying
  transactions
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

## Query operation

```
aboveInclusive()            - All keys ≥ x 	IDBKeyRange.lowerBound(x)
above()                     - All keys > x 	IDBKeyRange.lowerBound(x, true)
belowInclusive()            - All keys ≤ y 	IDBKeyRange.upperBound(y)
below()                     - All keys < y 	IDBKeyRange.upperBound(y, true)
betweenInclusive()          - All keys ≥ x && ≤ y 	IDBKeyRange.bound(x, y)
between()                   - All keys > x &&< y 	IDBKeyRange.bound(x, y, true, true)
betweenInclusiveUpper()     - All keys > x && ≤ y 	IDBKeyRange.bound(x, y, true, false)
betweenInclusiveLower()     - All keys ≥ x &&< y 	IDBKeyRange.bound(x, y, false, true)
exact()                     - The key = z 	IDBKeyRange.only(z)
```
