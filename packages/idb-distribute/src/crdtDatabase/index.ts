import {
  CLIENT_STATE_STORE,
  Lifecycle,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { LWWField, ROW_KEY } from "../crdt.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { Sync } from "../sync/index.ts";
import { SyncErrorCode } from "../sync/errors.ts";
import { promisifyIDBRequest } from "../utils.ts";
import { Table } from "../table.ts";
import { DatabaseSchema, EmptySchema } from "../types.ts";
import { TableSubscriptions } from "../tableSubscriptions.ts";

export class CRDTDatabase<TSchema extends DatabaseSchema = EmptySchema> {
  clientId: string;
  private lifecycle: Lifecycle;
  private clientState: ClientState;
  private rowStore: RowStore;
  private operationLog: OperationLog;
  private logicalClock: PersistedLogicalClock;
  private syncManager: Sync;
  private syncRemote: string;
  private dbName: string;
  private tableSubscriptions: TableSubscriptions;

  private tables: Map<string, Map<string, string[]>>;

  constructor(
    dbName: string = "crdt-db",
    tables: Map<string, Map<string, string[]>>,
    syncRemote: string,
    sync: Sync,
    storageRepository: Lifecycle,
    generateId: () => string,
  ) {
    this.tables = tables;
    this.dbName = dbName;
    this.syncRemote = syncRemote;
    this.tableSubscriptions = new TableSubscriptions();

    this.lifecycle = storageRepository;
    this.clientState = new ClientState();
    this.rowStore = new RowStore(storageRepository.indexes);
    this.operationLog = new OperationLog();
    this.syncManager = sync;
    this.logicalClock = new PersistedLogicalClock(this.clientState);
    this.clientId = generateId();
  }

  async open(): Promise<CRDTDatabase<TSchema>> {
    await this.lifecycle.open(this.dbName);
    await this.loadClientState();
    return this;
  }

  private async loadClientState(): Promise<void> {
    const tx = this.lifecycle.transaction(["clientState"], "readwrite");
    const state = await this.clientState.getClientState(tx);
    if (state.clientId) {
      this.clientId = state.clientId;
    } else {
      await this.clientState.saveClientId(tx, this.clientId);
    }
    await this.lifecycle.commit(tx);
  }

  table<TTableName extends keyof TSchema & string>(
    tableName: TTableName,
  ): Table<TSchema[TTableName]> {
    const indexes = this.tables.get(tableName);
    if (!indexes) {
      const available = Array.from(this.tables.keys()).join(", ");
      throw new Error(
        `Database is not setup to have the table ${tableName}. Available tables: ${available}`,
      );
    }
    return new Table(
      tableName,
      indexes,
      this.lifecycle,
      this.rowStore,
      this.operationLog,
      this.clientId,
      this.logicalClock,
      this.tableSubscriptions,
    );
  }

  /**
   * Get all rows in a table (uses IndexedDB index)
   * TODO: This should be removed in favor of query
   */
  async getAllRows(table: string): Promise<Map<IDBValidKey, Record<string, any>>> {
    const tx = this.lifecycle.transaction([ROWS_STORE], "readonly");
    const store = tx.objectStore("rows");
    const index = store.index("by-table");
    const records = await promisifyIDBRequest(index.getAll(table));

    const result = new Map<IDBValidKey, Record<string, any>>();
    for (const row of records) {
      if (Object.keys(row.fields).length > 0) {
        let rowData: Record<string, any> = {};
        for (const [field, fieldState] of Object.entries(row.fields)) {
          rowData[field] = (fieldState as LWWField).value;
        }

        rowData = Object.assign({ _key: row[ROW_KEY] }, rowData);
        result.set(row[ROW_KEY], rowData);
      }
    }

    return result;
  }

  async sync(): Promise<void> {
    try {
      const tx = this.lifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
      const syncRequest = await this.syncManager.createSyncRequest(tx);

      const response = await this.syncManager.sendSyncRequest(this.syncRemote, syncRequest);

      const writeTx = this.lifecycle.transaction([
        CLIENT_STATE_STORE,
        OPERATIONS_STORE,
        ROWS_STORE,
      ], "readwrite");
      await this.syncManager.handleSyncResponse(writeTx, this.logicalClock, response);
      await this.lifecycle.commit(writeTx);

      const changedTables = new Set(
        response.operations.map((operation) => operation.table),
      );
      for (const table of changedTables) {
        this.tableSubscriptions.notify(table);
      }
    } catch (error: any) {
      // Check if this is a "client state out of sync" error using the error name
      if (error.name === SyncErrorCode.CLIENT_STATE_OUT_OF_SYNC) {
        console.warn(
          "Client state is out of sync with server. Resetting local state...",
          error.message,
        );

        // Reset the client state
        const resetTx = this.lifecycle.transaction(
          [CLIENT_STATE_STORE, OPERATIONS_STORE],
          "readwrite",
        );
        await this.operationLog.resetSyncState(resetTx);
        await this.lifecycle.commit(resetTx);

        console.log("Client state reset complete. Retrying sync...");

        // Retry sync after reset
        return this.sync();
      }

      // Re-throw other errors
      throw error;
    }
  }

  async close(): Promise<void> {
    this.lifecycle.close();
  }
}
