export { CRDTDatabase } from "./crdtDatabase/index.ts";
export { CRDTDatabaseBuilder, newDatabase } from "./crdtDatabase/builder.ts";
export { Table } from "./table.ts";
export { above, below, between, exact, Index, type QueryCondition } from "./indexes.ts";
export { asc, desc, type Direction } from "./direction.ts";
export type { IndexDefinition } from "./indexes.ts";
export type { DatabaseSchema, EmptySchema } from "./types.ts";
export { isSyncError, type SyncError, SyncErrorCode } from "./sync/errors.ts";
export type { SyncHeadersProvider } from "./sync/index.ts";
export type { SubscriptionCallbackHandler, TableChangeEvent } from "./tableSubscriptions.ts";

// Below this line is only exported for the simulator
export { Lifecycle } from "./indexeddb/lifecycle.ts";
export { ClientState } from "./indexeddb/clientState.ts";
export { RowStore } from "./indexeddb/rowStore.ts";
export { OperationLog } from "./indexeddb/operationLog.ts";
export { Sync } from "./sync/index.ts";
