---
Status: ready-for-agent
---

## Parent

.scratch/split-idb-repository/PRD.md

## What to build

Extract row-storage methods (`saveRow`, `getRow`, `getRows`, `deleteRow`, query methods) from `IDBRepository` into `packages/syncdb/src/indexeddb/rowStore.ts`. The class accepts an `IDBTransaction` parameter for each method (same pattern as today). Tombstone logic in `saveRow` stays as-is (known debt, out of scope).

## Acceptance criteria

- [ ] `src/indexeddb/rowStore.ts` exists with a `RowStore` class owning all row CRUD methods
- [ ] `rowStore.test.ts` passes using `fake-indexeddb`: save, get, query with/without indexes, delete
- [ ] `RowStore` can be instantiated and tested without constructing a full `CRDTDatabase`
- [ ] Barrel re-exports `RowStore`
- [ ] Existing tests still pass
- [ ] Validated with the simulator — a full run completes without error

## Blocked by

- docs/issues/009-idb-lifecycle-module.md
