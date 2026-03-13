import { CRDTDatabase } from "./index.ts";
import { IDBRepository } from "../IDBRepository.ts";
import { IndexDefinition } from "../indexes.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { Sync } from "../sync/index.ts";
import { DatabaseSchema, EmptySchema, MergeSchema } from "../types.ts";

export class CRDTDatabaseBuilder<TSchema extends DatabaseSchema = EmptySchema> {
  dbName: string;
  syncRemote?: string;
  private tables: Map<string, Map<string, string[]>> = new Map();

  // Should these be part of the config?
  idbRepository?: IDBRepository;
  logicalClock?: PersistedLogicalClock;
  syncManager?: Sync;
  generateId?: () => string;

  constructor(dbName: string) {
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

  withCustomStorageRepository(repository: IDBRepository): CRDTDatabaseBuilder<TSchema> {
    this.idbRepository = repository;
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

  build(): CRDTDatabase<TSchema> {
    // Convert Map to IndexDefinition[] for IDBRepository
    const indexDefinitions: IndexDefinition[] = [];
    for (const [tableName, indexes] of this.tables) {
      for (const [indexName, keys] of indexes) {
        indexDefinitions.push({ name: indexName, table: tableName, keys });
      }
    }

    const idbRepository = this.idbRepository || new IDBRepository(indexDefinitions);
    const syncManager = this.syncManager || new Sync(idbRepository);
    const syncRemote = this.syncRemote || "";
    const generateId = this.generateId || crypto.randomUUID.bind(crypto);

    return new CRDTDatabase<TSchema>(
      this.dbName,
      this.tables,
      syncRemote,
      syncManager,
      idbRepository,
      generateId,
    );
  }
}

export function newDatabase(dbName: string): CRDTDatabaseBuilder<EmptySchema> {
  return new CRDTDatabaseBuilder(dbName);
}
