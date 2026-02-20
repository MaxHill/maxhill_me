# Implementation Plan: Add Index Creation to idb-distribute

## Goal
Allow users to declare indexes at database initialization. The indexes will be created as native IndexedDB indexes on the `rows` store. Query API implementation comes later.

## Scope
- ✅ Add index creation to IndexedDB schema
- ✅ Support single-field indexes (e.g., `["age"]`)
- ✅ Support compound indexes (e.g., `["firstName", "lastName"]`)
- ✅ Validate index definitions
- ❌ Query API (to be implemented later)

---

## Phase 1: Update Type Definitions

**File:** `src/IDBRepository.ts`

**Changes:**

Add a simple type for index definitions at the top of the file:

```typescript
// Add near the top of the file
export interface IndexDefinition {
  table: string;
  keys: string[];  // Field names, e.g., ["age"] or ["age", "name"]
}
```

---

## Phase 2: Update IDBRepository Constructor & Schema Creation

**File:** `src/IDBRepository.ts`

### 2.1 Add indexes parameter to constructor

```typescript
export class IDBRepository {
  db: IDBDatabase | undefined;
  private indexes?: Record<string, IndexDefinition>;  // NEW
  
  constructor(indexes?: Record<string, IndexDefinition>) {  // NEW parameter
    this.indexes = indexes;
  }
}
```

### 2.2 Add validation method

```typescript
private validateIndexDefinitions(): void {
  if (!this.indexes) return;
  
  for (const [indexName, definition] of Object.entries(this.indexes)) {
    if (!indexName || indexName.trim() === "") {
      throw new Error("Index name cannot be empty");
    }
    
    if (!definition.table || definition.table.trim() === "") {
      throw new Error(`Index "${indexName}": table name cannot be empty`);
    }
    
    if (!definition.keys || definition.keys.length === 0) {
      throw new Error(`Index "${indexName}": keys array cannot be empty`);
    }
    
    for (const key of definition.keys) {
      if (!key || key.trim() === "") {
        throw new Error(`Index "${indexName}": key name cannot be empty`);
      }
    }
  }
}
```

### 2.3 Add version calculation method

```typescript
// TODO: This version calculation doesn't handle removing indexes later (can't downgrade from v3 to v2).
// Consider using `this.indexes !== undefined ? 3 : 2` or a more sophisticated versioning strategy.
private calculateVersion(): number {
  const baseVersion = 2;
  const hasIndexes = this.indexes && Object.keys(this.indexes).length > 0;
  return hasIndexes ? baseVersion + 1 : baseVersion;
}
```

### 2.4 Update `open()` method

```typescript
async open(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Validate index definitions before opening
    this.validateIndexDefinitions();
    
    // Calculate version: base version (2) + 1 if indexes exist
    const version = this.calculateVersion();
    const request = indexedDB.open(dbName, version);
    
    // ... rest of existing code unchanged
  });
}
```

### 2.5 Add defensive checks in onupgradeneeded handler

Add this code at the end of the `onupgradeneeded` handler (after CLIENT_STATE_STORE creation):

```typescript
request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result;
  
  // ... existing ROWS_STORE creation code ...
  
  // ... existing OPERATIONS_STORE creation code ...
  
  // ... existing CLIENT_STATE_STORE creation code ...
  
  // NEW: Create user-defined indexes
  if (this.indexes && Object.keys(this.indexes).length > 0) {
    // Get or access the rows store (with defensive check)
    const tx = (event.target as IDBOpenDBRequest).transaction!;
    
    // Defensive check: ensure ROWS_STORE exists before trying to access it
    if (!db.objectStoreNames.contains(ROWS_STORE)) {
      throw new Error(`Cannot create indexes: ${ROWS_STORE} object store does not exist`);
    }
    
    const rowStore = tx.objectStore(ROWS_STORE);
    
    for (const [indexName, definition] of Object.entries(this.indexes)) {
      const internalIndexName = `${definition.table}_${indexName}`;
      
      // Build key path: [tableName, field1.value, field2.value, ...]
      const keyPath = [
        TABLE_NAME_KEY,  // "_tablename_idb_distribute"
        ...definition.keys.map(key => `row.fields.${key}.value`)
      ];
      
      // Create the index if it doesn't already exist
      if (!rowStore.indexNames.contains(internalIndexName)) {
        rowStore.createIndex(internalIndexName, keyPath, { unique: false });
      }
    }
  }
};
```

---

## Phase 3: Update CRDTDatabase Constructor

**File:** `src/crdtDatabase.ts`

### 3.1 Update imports

```typescript
// Update IDBRepository import to include IndexDefinition
import {
  BY_TABLE_INDEX,
  CLIENT_STATE_STORE,
  IDBRepository,
  IndexDefinition,  // NEW
  OPERATIONS_STORE,
  ROWS_STORE,
} from "./IDBRepository.ts";
```

### 3.2 Update constructor signature

```typescript
constructor(
  dbName: string = "crdt-db",
  indexes?: Record<string, IndexDefinition>,  // NEW parameter
  syncRemote: string,
  sync?: Sync,
  clientPersistance?: IDBRepository,
  generateId: () => string = crypto.randomUUID.bind(crypto),
) {
  this.dbName = dbName;
  this.syncRemote = syncRemote;
  
  // Pass indexes to IDBRepository constructor
  this.idbRepository = clientPersistance || new IDBRepository(indexes);
  
  this.syncManager = sync || new Sync(this.idbRepository);
  this.logicalClock = new PersistedLogicalClock(this.idbRepository);
  this.clientId = generateId();
}
```

---

## Phase 4: Export Types

**File:** `src/index.ts`

**Changes:**

```typescript
// Existing exports
export { CRDTDatabase } from "./crdtDatabase.ts";
export type { CRDTOperation, ValidKey } from "./crdt.ts";

// NEW: Export IndexDefinition type
export type { IndexDefinition } from "./IDBRepository.ts";
```

---

## Technical Details

### Index Naming Convention
- **User-facing name:** `usersByAge`
- **Internal IndexedDB name:** `users_usersByAge` (format: `{table}_{indexName}`)
- This allows the same index name to be used for different tables

### Key Path Structure
For an index with `keys: ["age"]`:
```javascript
["_tablename_idb_distribute", "row.fields.age.value"]
```

For a compound index with `keys: ["age", "name"]`:
```javascript
["_tablename_idb_distribute", "row.fields.age.value", "row.fields.name.value"]
```

### Indexed Values
IndexedDB will automatically extract values from the nested path:
- `row.fields.age.value` → extracts the actual age value (e.g., `30`)
- For a row in table "users" with age 30, the index entry will be: `["users", 30]`

### Version Management
- **No indexes:** Version 2 (current)
- **With indexes:** Version 3 (Option A - always version 3 when indexes exist)

### Validation Rules
1. Index name cannot be empty or whitespace
2. Table name cannot be empty or whitespace
3. Keys array cannot be empty
4. Individual key names cannot be empty or whitespace

---

## Usage Example

```typescript
import { CRDTDatabase } from "idb-distribute";

const db = new CRDTDatabase(
  "mydb",
  {
    usersByAge: { table: "users", keys: ["age"] },
    usersByName: { table: "users", keys: ["firstName", "lastName"] },
    postsByAuthor: { table: "posts", keys: ["authorId"] }
  },
  "http://sync.example.com"
);

await db.open();

// Indexes are now created in IndexedDB!
// Internal index names: "users_usersByAge", "users_usersByName", "posts_postsByAuthor"

// Insert data (existing API unchanged)
await db.setRow("users", "u1", { age: 30, firstName: "Alice", lastName: "Smith" });

// Query API to be implemented later...
```

---

## Phase 5: Add Tests

**File:** `src/IDBRepository.test.ts` (or create if doesn't exist)

### Test Cases

#### 5.1 Basic Index Creation
```typescript
test("should create single-field index", async () => {
  const indexes = {
    usersByAge: { table: "users", keys: ["age"] }
  };
  
  const repo = new IDBRepository(indexes);
  await repo.open("test-db-single-index");
  
  const tx = repo.transaction(["rows"], "readonly");
  const store = tx.objectStore("rows");
  
  // Verify index exists with correct internal name
  expect(store.indexNames.contains("users_usersByAge")).toBe(true);
  
  repo.close();
});
```

#### 5.2 Compound Index Creation
```typescript
test("should create compound index", async () => {
  const indexes = {
    usersByName: { table: "users", keys: ["firstName", "lastName"] }
  };
  
  const repo = new IDBRepository(indexes);
  await repo.open("test-db-compound-index");
  
  const tx = repo.transaction(["rows"], "readonly");
  const store = tx.objectStore("rows");
  
  expect(store.indexNames.contains("users_usersByName")).toBe(true);
  
  repo.close();
});
```

#### 5.3 Multiple Indexes on Same Table
```typescript
test("should create multiple indexes for same table", async () => {
  const indexes = {
    usersByAge: { table: "users", keys: ["age"] },
    usersByName: { table: "users", keys: ["firstName", "lastName"] }
  };
  
  const repo = new IDBRepository(indexes);
  await repo.open("test-db-multiple-indexes");
  
  const tx = repo.transaction(["rows"], "readonly");
  const store = tx.objectStore("rows");
  
  expect(store.indexNames.contains("users_usersByAge")).toBe(true);
  expect(store.indexNames.contains("users_usersByName")).toBe(true);
  
  repo.close();
});
```

#### 5.4 Multiple Tables with Same Index Name
```typescript
test("should allow same index name for different tables", async () => {
  const indexes = {
    usersByAge: { table: "users", keys: ["age"] },
    postsByAge: { table: "posts", keys: ["age"] }  // Same "byAge" suffix but different tables
  };
  
  const repo = new IDBRepository(indexes);
  await repo.open("test-db-same-index-name");
  
  const tx = repo.transaction(["rows"], "readonly");
  const store = tx.objectStore("rows");
  
  // Both indexes exist with different internal names
  expect(store.indexNames.contains("users_usersByAge")).toBe(true);
  expect(store.indexNames.contains("posts_postsByAge")).toBe(true);
  
  repo.close();
});
```

#### 5.5 Validation: Empty Index Name
```typescript
test("should throw error for empty index name", async () => {
  const indexes = {
    "": { table: "users", keys: ["age"] }
  };
  
  const repo = new IDBRepository(indexes);
  
  await expect(repo.open("test-db-empty-index-name")).rejects.toThrow(
    "Index name cannot be empty"
  );
});
```

#### 5.6 Validation: Empty Table Name
```typescript
test("should throw error for empty table name", async () => {
  const indexes = {
    usersByAge: { table: "", keys: ["age"] }
  };
  
  const repo = new IDBRepository(indexes);
  
  await expect(repo.open("test-db-empty-table-name")).rejects.toThrow(
    'Index "usersByAge": table name cannot be empty'
  );
});
```

#### 5.7 Validation: Empty Keys Array
```typescript
test("should throw error for empty keys array", async () => {
  const indexes = {
    invalidIndex: { table: "users", keys: [] }
  };
  
  const repo = new IDBRepository(indexes);
  
  await expect(repo.open("test-db-empty-keys")).rejects.toThrow(
    'Index "invalidIndex": keys array cannot be empty'
  );
});
```

#### 5.8 Validation: Empty Key Name
```typescript
test("should throw error for empty key name in keys array", async () => {
  const indexes = {
    usersByAge: { table: "users", keys: ["age", ""] }
  };
  
  const repo = new IDBRepository(indexes);
  
  await expect(repo.open("test-db-empty-key-name")).rejects.toThrow(
    'Index "usersByAge": key name cannot be empty'
  );
});
```

#### 5.9 Version Management
```typescript
test("should use version 2 when no indexes", async () => {
  const repo = new IDBRepository();
  await repo.open("test-db-no-indexes");
  
  expect(repo.db?.version).toBe(2);
  
  repo.close();
});

test("should use version 3 when indexes exist", async () => {
  const indexes = {
    usersByAge: { table: "users", keys: ["age"] }
  };
  
  const repo = new IDBRepository(indexes);
  await repo.open("test-db-with-indexes");
  
  expect(repo.db?.version).toBe(3);
  
  repo.close();
});
```

#### 5.10 Integration Test with CRDTDatabase
```typescript
test("should work with CRDTDatabase", async () => {
  const db = new CRDTDatabase(
    "test-crdt-db-with-indexes",
    {
      usersByAge: { table: "users", keys: ["age"] }
    },
    "http://test.com"
  );
  
  await db.open();
  
  // Verify index was created
  const tx = db.idbRepository.transaction(["rows"], "readonly");
  const store = tx.objectStore("rows");
  expect(store.indexNames.contains("users_usersByAge")).toBe(true);
  
  // Verify data can still be written (existing functionality)
  await db.setRow("users", "u1", { age: 30, name: "Alice" });
  const user = await db.get("users", "u1");
  expect(user).toEqual({ age: 30, name: "Alice" });
  
  await db.close();
});
```

---

## Summary of Changes

| File | Type | Changes |
|------|------|---------|
| `src/IDBRepository.ts` | MODIFY | Add `IndexDefinition` type, accept indexes in constructor, add validation, create indexes in `onupgradeneeded` |
| `src/crdtDatabase.ts` | MODIFY | Add indexes parameter, pass to IDBRepository |
| `src/index.ts` | MODIFY | Export `IndexDefinition` type |
| `src/IDBRepository.test.ts` | MODIFY/CREATE | Add comprehensive tests for index creation and validation |

---

## Potential Next Steps (Future Enhancements)

These test scenarios and features could be added in future iterations:

1. **Test: Verify indexes contain correct values after insertion**
   - Insert rows with indexed fields
   - Query the index directly to verify values are correctly stored
   - Verify compound index values are tuples

2. **Test: Rows without indexed fields**
   - Insert rows missing some indexed fields
   - Verify they have `undefined` in the index
   - Document behavior for queries (will be handled in query API phase)

3. **Test: Reopening database with same indexes**
   - Open database with indexes
   - Close and reopen with identical index config
   - Verify version doesn't increment and indexes still exist

4. **Test: Reopening database with different indexes**
   - Open database with one set of indexes
   - Close and reopen with different index config
   - Document expected behavior (currently undefined)

5. **Test: Index on tombstoned (deleted) rows**
   - Delete a row that's in an index
   - Verify index behavior with tombstoned data

6. **Feature: Index cleanup when removing index from config**
   - Detect removed indexes
   - Clean up orphaned indexes from previous versions

7. **Test: Concurrent writes and index updates**
   - Multiple simultaneous writes to indexed fields
   - Verify index consistency

8. **Test: Empty array for indexes parameter**
   - Pass `{}` as indexes parameter
   - Verify version is still 3 (or handle appropriately)

---

## Future Work (Out of Scope)

- Query API implementation
- Index query methods (`table().index(name).query()`)
- Query filters (`equals`, `above`, `below`, `between`)
- Iterator support for large result sets
- Handling missing fields in indexed rows

---

## Notes

- Rows with missing indexed fields will have `undefined` in the index
- IndexedDB will still create index entries for these rows
- Proper handling of `undefined` values will be implemented in the query API phase
- No materialized view store needed - indexes read directly from CRDT structure using nested key paths
