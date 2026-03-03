import {
  CLIENT_STATE_STORE,
  IDBRepository,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "./IDBRepository.ts";
import { applyOperationToRow, CRDTOperation, Dot, LWWField, ROW_KEY, ValidKey } from "./crdt.ts";
import { IndexDefinition, QueryPayload } from "./indexes.ts";
import { PersistedLogicalClock } from "./persistedLogicalClock.ts";
import { Sync } from "./sync/index.ts";
import { SyncErrorCode } from "./sync/errors.ts";
import { promisifyIDBRequest } from "./utils.ts";

export class CRDTDatabase {
  private clientId: string;
  private idbRepository: IDBRepository;
  private logicalClock: PersistedLogicalClock;
  private syncManager: Sync;
  private syncRemote: string;
  private dbName: string;

  constructor(
    dbName: string = "crdt-db",
    indexes: IndexDefinition[] = [],
    syncRemote: string,
    sync?: Sync,
    clientPersistance?: IDBRepository,
    generateId: () => string = crypto.randomUUID.bind(crypto),
  ) {
    this.dbName = dbName;
    this.syncRemote = syncRemote;
    // If clientPersistance is not provided, create one with indexes
    this.idbRepository = clientPersistance || new IDBRepository(indexes);
    this.syncManager = sync || new Sync(this.idbRepository);
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

  private async nextDot(tx: IDBTransaction): Promise<Dot> {
    if (!this.idbRepository) {
      throw new Error("idbRepository is undefined in nextDot");
    }
    const version = await this.logicalClock.tick(tx);
    return { clientId: this.clientId, version };
  }

  /**
   * Set a single field in a row
   */
  async setCell(table: string, rowKey: ValidKey, field: string, value: any): Promise<void> {
    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    const dot = await this.nextDot(tx);
    const op: CRDTOperation = {
      type: "set",
      table,
      rowKey,
      field,
      value,
      dot,
    };

    applyOperationToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
  }

  /**
   * Set an entire row
   */
  async setRow(table: string, rowKey: ValidKey, value: Record<string, any>): Promise<void> {
    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    const dot = await this.nextDot(tx);
    const op: CRDTOperation = {
      type: "setRow",
      table,
      rowKey,
      value,
      dot,
    };

    applyOperationToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
  }

  /**
   * Get a row's user-facing data
   */
  async get(table: string, rowKey: ValidKey): Promise<Record<string, any> | undefined> {
    const tx = this.idbRepository.transaction(["rows"], "readonly");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    if (Object.keys(row.fields).length === 0) {
      return undefined;
    }

    const result: Record<string, any> = {};
    for (const [field, fieldState] of Object.entries(row.fields)) {
      result[field] = fieldState.value;
    }
    return result;
  }

  /**
   * Delete a row
   */
  async deleteRow(table: string, rowKey: ValidKey): Promise<void> {
    const tx = this.idbRepository.transaction(["clientState", "rows", "operations"], "readwrite");
    const row = await this.idbRepository.getRow(tx, table, rowKey);

    // Build context from current fields
    const context: Record<string, number> = {};
    for (const fieldState of Object.values(row.fields)) {
      const clientId = fieldState.dot.clientId;
      context[clientId] = Math.max(context[clientId] ?? 0, fieldState.dot.version);
    }

    const dot = await this.nextDot(tx);
    const op: CRDTOperation = {
      type: "remove",
      table,
      rowKey,
      dot,
      context,
    };

    applyOperationToRow(row, op);

    await Promise.all([
      this.idbRepository.saveRow(tx, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
  }

  async *query(table: string, indexName: string, condition: QueryPayload) {
    const indexNames = (this.idbRepository.indexes || []).map((index) => index.name);
    if (!indexNames.includes(indexName)) {
      throw new Error(
        `Specified index ${indexName} does not exist in indexes:/n${
          indexNames.map((index) => `   ${index} /n`)
        }`,
      );
    }

    const tx = this.idbRepository!.transaction([ROWS_STORE], "readonly");
    const queryIterator = this.idbRepository.query(tx, table, indexName, condition);

    for await (const row of queryIterator) {
      // Skip rows with no fields (deleted rows) - consistent with get()
      // TODO: this should be fixed when writing the row
      if (Object.keys(row.fields).length === 0) {
        continue;
      }

      const result: Record<string, any> = {};
      for (const [field, fieldState] of Object.entries(row.fields)) {
        result[field] = fieldState.value;
      }
      yield result;
    }
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
        const rowData: Record<string, any> = {};
        for (const [field, fieldState] of Object.entries(record.fields)) {
          rowData[field] = (fieldState as LWWField).value;
        }
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
