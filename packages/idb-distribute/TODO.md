# CRDT Database Implementation TODO

## Phase 1: Type System & Foundation ✅ COMPLETE
- [x] Update `crdt.ts`: Change `Dot.counter` → `Dot.version`
- [x] Fix `crdtDatabase.ts` type errors (line 340, operation types)
- [x] Update all references in crdt.ts

## Phase 2: Logical Clock Integration
- [ ] Add `_logicalClock` store to crdtDatabase schema
- [ ] Remove in-memory `counter` field and `saveCounter()` method
- [ ] Replace `nextDot()` to use `persistedLogicalClock.tick()`
- [ ] Update all operation methods to pass transaction to `nextDot()`
- [ ] Add clock sync in `applyRemoteOps()` using `logicalClock.sync()`
- [ ] Add tests for clock persistence and sync

## Phase 3: Serialization Layer
- [ ] Reuse `encodeKey()` / `decodeKey()` from `serialization.ts`
- [ ] Create `encodeCRDTOperation()` and `decodeCRDTOperation()`
- [ ] Add serialization tests (roundtrip, all key types)

## Phase 4: Sync Protocol 🔴 CRITICAL
- [ ] Add `_lastSyncedVersion` store to schema
- [ ] Create `createSyncRequest()` method
- [ ] Create `applySyncResponse()` method
- [ ] Port integrity hashing (`hashSyncRequest`, `hashSyncResponse`, `validateSyncResponse`)
- [ ] Add network layer `sync(url)` method
- [ ] Add version tracking helpers (`getLastSyncedVersion`, `putLastSyncedVersion`)
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
