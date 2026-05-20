---
Status: ready-for-agent
---

## Parent

.scratch/split-idb-repository/PRD.md

## What to build

Extract database lifecycle logic (open, close, version upgrades, object-store creation, index migration) from `IDBRepository` into a new `packages/idb-distribute/src/indexeddb/lifecycle.ts` module. This module owns the `IDBDatabase` handle and exposes a method to create transactions. Co-locate the store-name constants (`ROWS_STORE`, `OPERATIONS_STORE`, `CLIENT_STATE_STORE`) and index constants here since lifecycle is responsible for schema setup.

Create `packages/idb-distribute/src/indexeddb/index.ts` as the barrel file for the new directory.

## Acceptance criteria

- [ ] `src/indexeddb/lifecycle.ts` exists with a `Lifecycle` class (or similar) that handles open/close/migrate
- [ ] `src/indexeddb/index.ts` barrel re-exports `Lifecycle` and the store-name constants
- [ ] Store-name and index-name constants are defined in `lifecycle.ts`
- [ ] A `lifecycle.test.ts` passes using `fake-indexeddb`: open, close, version upgrade, index migration
- [ ] Existing tests still pass (`deno test` or equivalent in the package)
- [ ] Validated with the simulator (`apps/sync/cmd/simulator/`) — a full run completes without error

## Blocked by

None - can start immediately
