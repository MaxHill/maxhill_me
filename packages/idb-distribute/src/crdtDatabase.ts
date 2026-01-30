import { CLIENT_STATE_STORE, IDBRepository, OPERATIONS_STORE, ROWS_STORE } from "./IDBRepository.ts";
import { applyOperationToRow, CRDTOperation, Dot, LWWField, ValidKey } from "./crdt.ts";
import { PersistedLogicalClock } from "./persistedLogicalClock.ts";
import { Sync } from "./sync/index.ts";
import { promisifyIDBRequest, txDone } from "./utils.ts";

export class CRDTDatabase {
  private clientId: string;
  private idbRepository: IDBRepository;
  private logicalClock: PersistedLogicalClock;
  private syncManager: Sync;
  private syncRemote: string;
  private dbName: string;

  constructor(
    dbName: string = "crdt-db",
    syncRemote: string,
    sync: Sync,
    clientPersistance = new IDBRepository(),
    generateId: () => string = crypto.randomUUID.bind(crypto),
  ) {
    this.dbName = dbName;
    this.syncRemote = syncRemote;
    this.idbRepository = clientPersistance;
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
    await txDone(tx);
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
      this.idbRepository.saveRow(tx, table, rowKey, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
    await txDone(tx);
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
      this.idbRepository.saveRow(tx, table, rowKey, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
    await txDone(tx);
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
      this.idbRepository.saveRow(tx, table, rowKey, row),
      this.idbRepository.saveOperation(tx, op),
    ]);
    await txDone(tx);
  }

  /**
   * Get all rows in a table (uses IndexedDB index)
   */
  async getAllRows(table: string): Promise<Map<IDBValidKey, Record<string, any>>> {
    const tx = this.idbRepository!.transaction(["rows"], "readonly");
    const store = tx.objectStore("rows");
    const index = store.index("by-table");
    const records = await promisifyIDBRequest(index.getAll(table));

    const result = new Map<IDBValidKey, Record<string, any>>();
    for (const record of records) {
      if (Object.keys(record.row.fields).length > 0) {
        const rowData: Record<string, any> = {};
        for (const [field, fieldState] of Object.entries(record.row.fields)) {
          rowData[field] = (fieldState as LWWField).value;
        }
        result.set(record.rowKey, rowData);
      }
    }

    return result;
  }

  async sync(): Promise<void> {
    const tx = this.idbRepository.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
    const syncRequest = await this.syncManager.createSyncRequest(tx);
    await txDone(tx);

    const response = await this.syncManager.sendSyncRequest(this.syncRemote, syncRequest);

    const writeTx = this.idbRepository.transaction([
      CLIENT_STATE_STORE,
      OPERATIONS_STORE,
      ROWS_STORE,
    ], "readwrite");
    await this.syncManager.handleSyncResponse(writeTx, this.logicalClock, response);
    await txDone(writeTx);
  }

  async close(): Promise<void> {
    this.idbRepository.close();
  }
}
