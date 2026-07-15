import { CRDTDatabase } from "./index.ts";
import { Lifecycle } from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { IndexDefinition } from "../indexes.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { OnUnauthorizedHandler, Sync, SyncHeadersProvider } from "../sync/index.ts";
import { DatabaseSchema, EmptySchema, MergeSchema } from "../types.ts";
import { assertValidDbName } from "../dbName.ts";

export class CRDTDatabaseBuilder<TSchema extends DatabaseSchema = EmptySchema> {
  dbName: string;
  syncRemote?: string;
  private tables: Map<string, Map<string, string[]>> = new Map();

  // Should these be part of the config?
  lifecycle?: Lifecycle;
  logicalClock?: PersistedLogicalClock;
  syncManager?: Sync;
  generateId?: () => string;
  private headersProvider?: SyncHeadersProvider;
  private onUnauthorized?: OnUnauthorizedHandler;

  constructor(dbName: string) {
    assertValidDbName(dbName);
    this.dbName = dbName;
  }

  withSyncRemote(remoteUrl: string): CRDTDatabaseBuilder<TSchema> {
    this.syncRemote = remoteUrl;
    return this;
  }

  addTable<
    TTableName extends string,
    TIndexes extends Record<string, string[]>,
  >(
    table: TTableName,
    indexes: TIndexes,
  ): CRDTDatabaseBuilder<MergeSchema<TSchema, TTableName, TIndexes>> {
    if (this.tables.has(table)) {
      console.warn(`Overriding table ${table}, that already existed.`);
    }
    this.tables.set(table, new Map(Object.entries(indexes)));

    return this as unknown as CRDTDatabaseBuilder<MergeSchema<TSchema, TTableName, TIndexes>>;
  }

  withCustomStorageRepository(repository: Lifecycle): CRDTDatabaseBuilder<TSchema> {
    this.lifecycle = repository;
    return this;
  }

  withCustomSync(syncManager: Sync): CRDTDatabaseBuilder<TSchema> {
    this.syncManager = syncManager;
    return this;
  }

  withCustomIdGenerator(generator: () => string): CRDTDatabaseBuilder<TSchema> {
    this.generateId = generator;
    return this;
  }

  withSyncHeaders(fn: SyncHeadersProvider): CRDTDatabaseBuilder<TSchema> {
    this.headersProvider = fn;
    return this;
  }

  withOnUnauthorized(fn: OnUnauthorizedHandler): CRDTDatabaseBuilder<TSchema> {
    this.onUnauthorized = fn;
    return this;
  }

  build(): CRDTDatabase<TSchema> {
    // Convert Map to IndexDefinition[] for Lifecycle
    const indexDefinitions: IndexDefinition[] = [];
    for (const [tableName, indexes] of this.tables) {
      for (const [indexName, keys] of indexes) {
        indexDefinitions.push({ name: indexName, table: tableName, keys });
      }
    }

    const lifecycle = this.lifecycle || new Lifecycle(indexDefinitions);
    const clientState = new ClientState();
    const rowStore = new RowStore(lifecycle.indexes);
    const operationLog = new OperationLog();
    const syncManager = this.syncManager || new Sync(clientState, rowStore, operationLog, this.headersProvider, this.onUnauthorized);
    const syncRemote = this.syncRemote || "";
    const generateId = this.generateId || crypto.randomUUID.bind(crypto);

    return new CRDTDatabase<TSchema>(
      this.dbName,
      this.tables,
      syncRemote,
      syncManager,
      lifecycle,
      generateId,
    );
  }
}

export function newDatabase(dbName: string): CRDTDatabaseBuilder<EmptySchema> {
  return new CRDTDatabaseBuilder(dbName);
}
