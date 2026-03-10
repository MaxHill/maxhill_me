import {
    CLIENT_STATE_STORE,
    IDBRepository,
    OPERATIONS_STORE,
    ROWS_STORE,
} from "../IDBRepository.ts";
import { LWWField, ROW_KEY } from "../crdt.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { Sync } from "../sync/index.ts";
import { SyncErrorCode } from "../sync/errors.ts";
import { promisifyIDBRequest } from "../utils.ts";
import { Table, TableDefinition } from "../table.ts";

export class CRDTDatabase {
    clientId: string;
    private idbRepository: IDBRepository;
    private logicalClock: PersistedLogicalClock;
    private syncManager: Sync;
    private syncRemote: string;
    private dbName: string;

    private tables: TableDefinition[];

    constructor(
        dbName: string = "crdt-db",
        tableDefinitions: TableDefinition[],
        syncRemote: string,
        sync: Sync,
        storageRepository: IDBRepository,
        generateId: () => string,
    ) {
        this.tables = tableDefinitions;
        this.dbName = dbName;
        this.syncRemote = syncRemote;

        // If clientPersistance is not provided, create one with indexes
        this.idbRepository = storageRepository;
        this.syncManager = sync;
        this.logicalClock = new PersistedLogicalClock(this.idbRepository);
        this.clientId = generateId();
    }

    async open(): Promise<void> {
        await this.idbRepository.open(this.dbName);
        await this.loadClientState();
    }

    private async loadClientState(): Promise<void> {
        const tx = this.idbRepository!.transaction(["clientState"], "readwrite");
        const clientState = await this.idbRepository.getClientState(tx);
        if (clientState.clientId) {
            this.clientId = clientState.clientId;
        } else {
            await this.idbRepository.saveClientId(tx, this.clientId);
        }
    }

    table(tableName: string) {
        const table = this.tables.find((tableDefinition) => tableDefinition.tableName === tableName);
        if (!table) {
            throw new Error(`Database is not setup to have the table ${tableName}. Available tables: ${this.tables.map(t => t.tableName).join(", ")}`)
        }
        return new Table(table, this.idbRepository, this, this.logicalClock);
    }

    /**
     * Get all rows in a table (uses IndexedDB index)
     * TODO: This should be removed in favor of query
     */
    async getAllRows(table: string): Promise<Map<IDBValidKey, Record<string, any>>> {
        const tx = this.idbRepository!.transaction([ROWS_STORE], "readonly");
        const store = tx.objectStore("rows");
        const index = store.index("by-table");
        const records = await promisifyIDBRequest(index.getAll(table));

        const result = new Map<IDBValidKey, Record<string, any>>();
        for (const record of records) {
            if (Object.keys(record.fields).length > 0) {
                let rowData: Record<string, any> = {};
                for (const [field, fieldState] of Object.entries(record.fields)) {
                    rowData[field] = (fieldState as LWWField).value;
                }

                rowData = Object.assign({ _key: record[ROW_KEY] }, rowData);
                result.set(record[ROW_KEY], rowData);
            }
        }

        return result;
    }

    async sync(): Promise<void> {
        try {
            const tx = this.idbRepository.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
            const syncRequest = await this.syncManager.createSyncRequest(tx);

            const response = await this.syncManager.sendSyncRequest(this.syncRemote, syncRequest);

            const writeTx = this.idbRepository.transaction([
                CLIENT_STATE_STORE,
                OPERATIONS_STORE,
                ROWS_STORE,
            ], "readwrite");
            await this.syncManager.handleSyncResponse(writeTx, this.logicalClock, response);
        } catch (error: any) {
            // Check if this is a "client state out of sync" error using the error name
            if (error.name === SyncErrorCode.CLIENT_STATE_OUT_OF_SYNC) {
                console.warn(
                    "Client state is out of sync with server. Resetting local state...",
                    error.message,
                );

                // Reset the client state
                const resetTx = this.idbRepository.transaction(
                    [CLIENT_STATE_STORE, OPERATIONS_STORE],
                    "readwrite",
                );
                await this.idbRepository.resetSyncState(resetTx);

                console.log("Client state reset complete. Retrying sync...");

                // Retry sync after reset
                return this.sync();
            }

            // Re-throw other errors
            throw error;
        }
    }

    async close(): Promise<void> {
        this.idbRepository.close();
    }
}
