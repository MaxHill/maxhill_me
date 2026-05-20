---
Status: ready-for-agent
---

# Split IDBRepository into Focused Storage Modules

## Problem Statement

`IDBRepository` is a 469-line god class with ~20 methods spanning four distinct concerns: database lifecycle, row storage, operation logging, and client state management. Understanding any one concern requires reading the entire class. Business logic has leaked into it (tombstone handling in `saveRow`). It's difficult to test individual concerns in isolation, and the single-class design obscures the natural seams where a future alternative backend could slot in.

## Solution

Split `IDBRepository` into four focused modules under `src/indexeddb/`, each owning one concern. All consumers (`Table`, `CRDTDatabase`, `Sync`, `PersistedLogicalClock`) update their imports. The public API of the package does not change. Existing integration tests continue to pass.

## User Stories

1. As a contributor, I want row-storage logic in its own module, so that I can understand and modify it without reading operation-log or lifecycle code.
2. As a contributor, I want operation-log logic in its own module, so that sync-related bugs are localized to one file.
3. As a contributor, I want client-state logic in its own module, so that changes to how clientId or serverVersion are persisted don't risk breaking row queries.
4. As a contributor, I want database lifecycle (open/close/migrate) in its own module, so that schema migration logic is isolated from read/write operations.
5. As a contributor, I want each module independently testable, so that I can write focused unit tests without setting up the entire database graph.
6. As a future contributor, I want the storage layer in a directory named `indexeddb/`, so that it's obvious where to add an alternative backend later.
7. As a contributor, I want the store-name constants and index-name constants co-located with the module that uses them, so that I don't have to trace imports back to a single constants file.
8. As a consumer of the package, I want no public API changes, so that this refactor is invisible to me.
9. As a test author, I want to instantiate `RowStore` or `OperationLog` with a fake-indexeddb transaction without needing to construct a full `CRDTDatabase`.
10. As a contributor working on sync, I want `OperationLog` to be the single source of truth for operation persistence, so that sync bugs don't require understanding row-storage internals.

## Implementation Decisions

- **Directory structure**: `packages/idb-distribute/src/indexeddb/` with `lifecycle.ts`, `rowStore.ts`, `operationLog.ts`, `clientState.ts`, and `index.ts` (barrel).
- **No explicit interfaces for now**: Each module is a plain class. The directory name (`indexeddb/`) foreshadows future backend-swappability but we're not building that abstraction yet.
- **Transaction parameter pattern preserved**: All methods continue to accept `IDBTransaction` as a parameter. Only `lifecycle.ts` holds the `IDBDatabase` handle and can create transactions.
- **`IDBRepository` is deleted**: Not deprecated, fully removed. All imports updated.
- **Constant co-location**: Store name constants (`ROWS_STORE`, `OPERATIONS_STORE`, `CLIENT_STATE_STORE`) and index constants move into the module that owns them. The barrel re-exports any that consumers need.
- **Tombstone logic in `saveRow` stays as-is**: Known leak, but out of scope for this refactor.
- **`Table` keeps opening its own transactions**: It will import `Lifecycle` (for `transaction()`/`commit()`) plus `RowStore` and `OperationLog`. No change to Table's transaction-opening pattern.
- **Circular dependency resolved as a side effect**: `Table` currently imports `CRDTDatabase` to access `clientId`. After the split, `clientId` will be passed as a string (or getter) at construction, removing the circular import.
- **Public package exports unchanged**: `src/index.ts` continues exporting the same symbols.

## Testing Decisions

- **What makes a good test here**: Each module should be tested through its public methods against a real `fake-indexeddb` instance. Tests assert on observable storage state (what you can read back), not internal implementation details.
- **All four modules get tests**:
  - `lifecycle.test.ts` — open/close, version upgrades, index migration
  - `rowStore.test.ts` — saveRow, getRow, query (with and without indexes)
  - `operationLog.test.ts` — save, batch save, mark synced, get unsynced, count, reset
  - `clientState.test.ts` — save/get clientId, serverVersion, logicalClock version
- **Prior art**: `src/IDBRepository.test.ts` already tests most of this functionality in integration. The new tests will be more focused (one concern per file) but follow the same pattern: open a fake-indexeddb, run operations, assert results.
- **Existing tests must pass**: `IDBRepository.test.ts` can be deleted once its coverage is fully replaced by the four new test files. The `crdtDatabase/index.test.ts` integration tests must continue passing unchanged.

## Out of Scope

- Moving tombstone/business logic out of `saveRow` (known tech debt, separate effort)
- Abstracting transaction type for backend-swappability (foreshadowed by directory name, not built)
- Refactoring `Table`'s transaction-opening pattern (candidate #1 from the architecture review)
- Adding explicit TypeScript interfaces for the storage modules
- Changing the public API of the package

## Further Notes

- The circular dependency between `table.ts` and `crdtDatabase/index.ts` gets resolved as a side effect: `Table` will receive `clientId` directly instead of holding a reference to `CRDTDatabase`.
- This refactor is a prerequisite for cleanly tackling candidate #4 (testable seams in `Sync`) since `Sync` currently depends on `IDBRepository` — after the split it will depend only on `OperationLog` and `ClientState`, making its collaborators mockable.
