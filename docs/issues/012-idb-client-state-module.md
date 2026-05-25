---
Status: ready-for-agent
---

## Parent

.scratch/split-idb-repository/PRD.md

## What to build

Extract client-state methods (save/get clientId, serverVersion, logicalClock version) from `IDBRepository` into `packages/idb-distribute/src/indexeddb/clientState.ts`. Methods continue to accept `IDBTransaction` as a parameter.

## Acceptance criteria

- [ ] `src/indexeddb/clientState.ts` exists with a `ClientState` class
- [ ] `clientState.test.ts` passes using `fake-indexeddb`: save/get clientId, serverVersion, logicalClock version
- [ ] `ClientState` can be instantiated and tested without constructing a full `CRDTDatabase`
- [ ] Barrel re-exports `ClientState`
- [ ] Existing tests still pass
- [ ] Validated with the simulator — a full run completes without error

## Blocked by

- docs/issues/009-idb-lifecycle-module.md
