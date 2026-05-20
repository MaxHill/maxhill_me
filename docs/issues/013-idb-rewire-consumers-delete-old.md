---
Status: ready-for-agent
---

## Parent

.scratch/split-idb-repository/PRD.md

## What to build

Update all consumers (`Table`, `CRDTDatabase`, `Sync`, `PersistedLogicalClock`, `Indexes`) to import from the new `indexeddb/` modules instead of `IDBRepository`. Resolve the circular dependency by passing `clientId` directly to `Table` instead of a `CRDTDatabase` reference. Delete `IDBRepository.ts` and `IDBRepository.test.ts` (after confirming coverage is fully replaced). Ensure public package exports in `src/index.ts` remain unchanged.

## Acceptance criteria

- [ ] `IDBRepository.ts` and `IDBRepository.test.ts` are deleted
- [ ] All consumers import from `./indexeddb/` barrel or specific modules
- [ ] `Table` receives `clientId` as a string/getter, not a `CRDTDatabase` reference
- [ ] No circular dependency between `table.ts` and `crdtDatabase/index.ts`
- [ ] Public exports in `src/index.ts` are unchanged
- [ ] All existing integration tests pass (`crdtDatabase/index.test.ts`, etc.)
- [ ] Validated with the simulator — a full run completes without error

## Blocked by

- docs/issues/010-idb-row-store-module.md
- docs/issues/011-idb-operation-log-module.md
- docs/issues/012-idb-client-state-module.md
