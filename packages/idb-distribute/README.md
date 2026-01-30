# CRDT Database — IndexedDB Storage Layout

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
const iterator: AsyncIterator<User> = db
  .index("usersByAge")
  .iterate(above(30));
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
