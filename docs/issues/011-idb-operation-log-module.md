---
Status: ready-for-agent
---

## Parent

.scratch/split-idb-repository/PRD.md

## What to build

Extract operation-log methods (save operation, batch save, mark synced, get unsynced, count, reset) from `IDBRepository` into `packages/idb-distribute/src/indexeddb/operationLog.ts`. This becomes the single source of truth for operation persistence. Methods continue to accept `IDBTransaction` as a parameter.

## Acceptance criteria

- [ ] `src/indexeddb/operationLog.ts` exists with an `OperationLog` class
- [ ] `operationLog.test.ts` passes using `fake-indexeddb`: save, batch save, mark synced, get unsynced, count, reset
- [ ] `OperationLog` can be instantiated and tested without constructing a full `CRDTDatabase`
- [ ] Barrel re-exports `OperationLog`
- [ ] Existing tests still pass
- [ ] Validated with the simulator — a full run completes without error

## Blocked by

- docs/issues/009-idb-lifecycle-module.md
