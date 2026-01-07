# CRDT Database Implementation TODO

```typescript
const db = new CRDTDB("MYDATABASE", {
    indexes: {
        usersByAge: {
            table: "users",
            keys: ["age"]
        },
        usersByFullName: {
            table: "users",
            keys: ["firstname", "lastname"]
        }
    }
});

// Get 1 item
const user: User | undefined = db.table("users").get("some_id");
const usersByFullName: User|undefined = db.index("usersByFullName").get(["kalle", "kula"]);

// Query multiple items
const userList: User[] = db.table("users").query(eq("some_id"));
const userListByEmail: User[] = db
    .index("usersByFullName")
    .query(equals(["kalle", "kula"]));

// Iterate range of items
const usersIterator: AsyncIterator<User> = db.itereate(eq("some_id"));
for await (const user of usersIterator) {
    console.log(user)
}

const usersIteratorByEmail: AsyncIterator<User> = db
    .index("usersByAge")
    .query(gt(30)); // User[] All users with an age above 30
for await (const user of usersIteratorByEmail) {
    console.log("Oldtimer:", user)
}

// Transactions
await db.transaction(async (tx) => {
    const user: User | undefined = tx.table("users").get("some_id");
    const usersByFullName: User|undefined = tx.index("usersByFullName").get(["kalle", "kula"]);
});


// Query filters:
// Above / GT
// Equivilent to IDBKeyrange.lowerBound
above(bound: ValidKey, inc: "inclusive" | "exclusive"): Filter // Type signature
db.query(above(1, "inclusive"))

// Below / LT
// Equivilent to IDBKeyrange.upperBound
below(bound: ValidKey, inc: "inclusive" | "exclusive"): Filter // Type signature
db.query(below(1, "inclusive"))

// Between / range
// Equivilent to IDBKeyrange.bound
between(lowerBound: ValidKey, upperBound: ValidKey, inc: "inclusive" | "exclusive"): Filter // Type signature
db.query(between(1, "inclusive"))

// Equals / eq
// Equivilent to IDBKeyrange.only
equals(predicate: ValidKey): Filter
db.query(equals("some_id"))




```

## Phase 1: Type System & Foundation ✅ COMPLETE

- [x] Update `crdt.ts`: Change `Dot.counter` → `Dot.version`
- [x] Fix `crdtDatabase.ts` type errors (line 340, operation types)
- [x] Update all references in crdt.ts

## Phase 2: Logical Clock Integration

- [x] Add `_logicalClock` store to crdtDatabase schema
- [x] Remove in-memory `counter` field and `saveCounter()` method
- [x] Replace `nextDot()` to use `persistedLogicalClock.tick()`
- [x] Update all operation methods to pass transaction to `nextDot()`
- [x] Add clock sync in `applyRemoteOps()` using `logicalClock.sync()`
- [x] Add tests for clock persistence and sync

## Phase 3: Serialization Layer

- [ ] Reuse `encodeKey()` / `decodeKey()` from `serialization.ts`
- [ ] Create `encodeCRDTOperation()` and `decodeCRDTOperation()`
- [ ] Add serialization tests (roundtrip, all key types)

## Phase 4: Sync Protocol 🔴 CRITICAL

- [ ] Add `_lastSyncedVersion` store to schema
- [ ] Create `createSyncRequest()` method
- [ ] Create `applySyncResponse()` method
- [ ] Port integrity hashing (`hashSyncRequest`, `hashSyncResponse`,
      `validateSyncResponse`)
- [ ] Add network layer `sync(url)` method
- [ ] Add version tracking helpers (`getLastSyncedVersion`,
      `putLastSyncedVersion`)
- [ ] Add sync protocol tests

## Phase 7: Background Sync

- [ ] Integrate `Scheduler` class into `CRDTDatabase`
- [ ] Add `enableAutoSync(intervalMs, url)` method
- [ ] Add `disableAutoSync()` method
- [ ] Add scheduler tests

## Phase 8: Testing & Validation

- [ ] Update `crdt.test.ts` property-based tests for new types
- [ ] Add field-level conflict tests
- [ ] Add tombstone tests
- [ ] Port multi-client simulator for convergence testing
- [ ] Add CRDT property tests (commutativity, associativity, idempotence)

## Deferred (Future Phases)

- Phase 5: WAL Pattern (write-then-apply for better crash recovery)
- Phase 6: Schema Management (openCRDTDatabase, typed helpers)

## Notes

- Phase 1 already complete
- Tests should be written alongside each phase
- Execute phases in order: 2 → 3 → 4 → 7 → 8
- Phase 4 (Sync) depends on Phases 2 & 3
