export { CRDTDatabase } from "./crdtDatabase";
export { newDatabase, CRDTDatabaseBuilder } from "./crdtDatabase/builder";
export { Table } from "./table";
export { Index, exact, above, below, between, type QueryCondition } from "./indexes.ts";
export type { IndexDefinition } from "./indexes.ts";
export type { DatabaseSchema, EmptySchema } from "./types";
export { isSyncError, type SyncError, SyncErrorCode } from "./sync/errors.ts";
