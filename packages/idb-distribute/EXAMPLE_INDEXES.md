# Index Usage Example

This document demonstrates how to use indexes in idb-distribute.

## Basic Usage

```typescript
import { CRDTDatabase, IndexDefinition } from "@maxhill/idb-distribute";

// Define your indexes
const db = new CRDTDatabase(
  "mydb",                    // Database name
  {                          // Indexes configuration
    usersByAge: { table: "users", keys: ["age"] },
    usersByName: { table: "users", keys: ["firstName", "lastName"] },
    postsByAuthor: { table: "posts", keys: ["authorId"] }
  },
  "http://sync.example.com"  // Sync remote URL
);

await db.open();

// Now write data as usual
await db.setRow("users", "u1", { 
  age: 30, 
  firstName: "Alice", 
  lastName: "Smith" 
});

await db.setRow("users", "u2", { 
  age: 25, 
  firstName: "Bob", 
  lastName: "Jones" 
});

await db.setRow("posts", "p1", { 
  authorId: "u1", 
  content: "Hello world!" 
});

// Indexes are automatically maintained!
```

## Index Types

### Single-field Index

```typescript
{
  usersByAge: { table: "users", keys: ["age"] }
}
```

This creates an index that allows efficient queries on the `age` field.

### Compound Index

```typescript
{
  usersByName: { table: "users", keys: ["firstName", "lastName"] }
}
```

This creates a compound index on multiple fields. Useful for queries that need to filter by multiple fields efficiently.

### Multiple Tables

```typescript
{
  usersByAge: { table: "users", keys: ["age"] },
  postsByAuthor: { table: "posts", keys: ["authorId"] }
}
```

You can define indexes for different tables. Index names can even be similar (like "usersByAge" and "postsByAge") because they're scoped to their respective tables internally.

## How Indexes Work

### Internal Structure

When you define an index like:
```typescript
{ usersByAge: { table: "users", keys: ["age"] } }
```

idb-distribute creates a native IndexedDB index with:
- **Internal name**: `users_usersByAge` (format: `{table}_{indexName}`)
- **Key path**: `["_tablename_idb_distribute", "row.fields.age.value"]`

This means:
- The index includes the table name for efficient table-scoped queries
- It directly reads from the nested CRDT structure
- No separate materialized view is needed

### Database Versioning

- **Without indexes**: Database version 2
- **With indexes**: Database version 3

Once you add indexes to a database, it upgrades to version 3. The version calculation is automatic.

## Validation

idb-distribute validates your index definitions:

❌ **Invalid: Empty index name**
```typescript
{ "": { table: "users", keys: ["age"] } }
// Error: Index name cannot be empty
```

❌ **Invalid: Empty table name**
```typescript
{ usersByAge: { table: "", keys: ["age"] } }
// Error: Index "usersByAge": table name cannot be empty
```

❌ **Invalid: Empty keys array**
```typescript
{ usersByAge: { table: "users", keys: [] } }
// Error: Index "usersByAge": keys array cannot be empty
```

❌ **Invalid: Empty key name**
```typescript
{ usersByAge: { table: "users", keys: ["age", ""] } }
// Error: Index "usersByAge": key name cannot be empty
```

## Missing Fields

If you create an index on a field but some rows don't have that field:

```typescript
const db = new CRDTDatabase(
  "mydb",
  { usersByAge: { table: "users", keys: ["age"] } },
  "http://sync.example.com"
);

await db.open();

// This row has the indexed field
await db.setRow("users", "u1", { age: 30, name: "Alice" });

// This row is missing the indexed field
await db.setRow("users", "u2", { name: "Bob" });
```

- No error is thrown
- The row is still saved
- IndexedDB stores `undefined` for the missing field in the index
- Future query API will handle filtering out `undefined` values

## Query API (Coming Soon)

The query API is planned for a future release. It will look like:

```typescript
// Get all users with age > 18
const adults = await db.table("users").index("usersByAge").query(above(18));

// Get user by exact name
const user = await db.table("users").index("usersByName").get(["Alice", "Smith"]);

// Iterate with cursor
for await (const user of db.table("users").index("usersByAge").iterate(above(30))) {
  console.log(user);
}
```

For now, you can access indexes directly via IndexedDB APIs if needed.

## TypeScript Support

Full TypeScript types are exported:

```typescript
import type { IndexDefinition } from "@maxhill/idb-distribute";

const myIndexes: Record<string, IndexDefinition> = {
  usersByAge: { table: "users", keys: ["age"] },
  usersByName: { table: "users", keys: ["firstName", "lastName"] }
};
```

## Performance Notes

- Native IndexedDB indexes are used for maximum performance
- Indexes are automatically maintained on all writes
- No separate materialized view or manual index updates needed
- Compound indexes support efficient multi-field queries
