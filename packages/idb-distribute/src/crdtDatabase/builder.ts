import { CRDTDatabase } from ".";
import { IDBRepository } from "../IDBRepository";
import { IndexDefinition, indexDefinitionsFromTableDefinition } from "../indexes";
import { PersistedLogicalClock } from "../persistedLogicalClock";
import { Sync } from "../sync";
import { TableDefinition } from "../table";

export class CRDTDatabaseBuilder {
    dbName: string;
    syncRemote?: string;
    tables: TableDefinition[] = [];

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
        if (this.tables.find((tableDefinition) => tableDefinition.tableName === table)) {
            console.warn(`Overriding table ${table}, that already existed.`)
        }
        this.tables.push({ tableName: table, indexes });
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
        const indexDefinitions = this.tables.flatMap(table => indexDefinitionsFromTableDefinition(table));

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
