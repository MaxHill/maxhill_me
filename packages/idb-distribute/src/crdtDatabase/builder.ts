import { CRDTDatabase } from ".";
import { IDBRepository } from "../IDBRepository";
import { IndexDefinition } from "../indexes";
import { PersistedLogicalClock } from "../persistedLogicalClock";
import { Sync } from "../sync";

export class CRDTDatabaseBuilder {
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

    withSyncRemote(remoteUrl: string): CRDTDatabaseBuilder {
        this.syncRemote = remoteUrl;
        return this;
    }

    addTable(table: string, indexes: {
        [key: string]: string[]
    }): CRDTDatabaseBuilder {
        if (this.tables.has(table)) {
            console.warn(`Overriding table ${table}, that already existed.`)
        }
        this.tables.set(table, new Map(Object.entries(indexes)));
        return this;
    }

    withCustomStorageRepository(repository: IDBRepository): CRDTDatabaseBuilder {
        this.idbRepository = repository;
        return this;
    }

    withCustomSync(syncManager: Sync): CRDTDatabaseBuilder {
        this.syncManager = syncManager;
        return this;
    }

    withCustomIdGenerator(generator: () => string): CRDTDatabaseBuilder {
        this.generateId = generator;
        return this;
    }

    build(): CRDTDatabase {
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

        return new CRDTDatabase(this.dbName, this.tables, syncRemote, syncManager, idbRepository, generateId);
    }
}

export function newDatabase(dbName: string): CRDTDatabaseBuilder {
    return new CRDTDatabaseBuilder(dbName);
}
