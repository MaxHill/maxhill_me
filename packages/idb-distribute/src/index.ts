export { CRDTDatabase } from "./crdtDatabase/index.ts";
export { newDatabase, CRDTDatabaseBuilder } from "./crdtDatabase/builder.ts";
export { Table } from "./table.ts";
export {
  above,
  below,
  between,
  exact,
  Index,
  type QueryCondition,
} from "./indexes.ts";
export { asc, desc, type Direction } from "./direction.ts";
export type { IndexDefinition } from "./indexes.ts";
export type { DatabaseSchema, EmptySchema } from "./types.ts";
export { isSyncError, type SyncError, SyncErrorCode } from "./sync/errors.ts";
export type { SubscriptionCallbackHandler, TableChangeEvent } from "./tableSubscriptions.ts";
