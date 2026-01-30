import { CRDTOperation, Dot, ORMapRow, ValidKey } from "./crdt.ts";
import { asyncCursorIterator, promisifyIDBRequest, validateTransactionStores } from "./utils.ts";

const SYNCED_STATUS = {
  NOT_SYNCED: 0,
  SYNCED: 1,
} as const;

// Stores
export const ROWS_STORE = "rows";
export const OPERATIONS_STORE = "operations";
export const CLIENT_STATE_STORE = "clientState";

// Indexes
const BY_TABLE_INDEX = "by-table";
const BY_SYNCED_INDEX = "by-synced";
const BY_CLIENT_SYNCED_INDEX = "by-client-synced";

// Client state keys
const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";
const CLIENT_ID = "clientId";
const LOGICAL_CLOCK = "logicalClock";

export class IDBRepository {
  db: IDBDatabase | undefined;

  async open(dbName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 2);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Store individual rows
        if (!db.objectStoreNames.contains(ROWS_STORE)) {
          const rowStore = db.createObjectStore(ROWS_STORE, { keyPath: ["tableName", "rowKey"] });
          rowStore.createIndex(BY_TABLE_INDEX, "tableName", { unique: false });
        }

        // Store operations log
        if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
          const operationStore = db.createObjectStore(OPERATIONS_STORE, {
            keyPath: ["op.dot.clientId", "op.dot.version"],
          });
          operationStore.createIndex(BY_SYNCED_INDEX, "synced", { unique: false });
          operationStore.createIndex(BY_CLIENT_SYNCED_INDEX, ["op.dot.clientId", "synced"], { unique: false });
        }

        // Store client state
        if (!db.objectStoreNames.contains(CLIENT_STATE_STORE)) {
          const s = db.createObjectStore(CLIENT_STATE_STORE);
          // clientId
          s.put(-1, LOGICAL_CLOCK);
          s.put(-1, LAST_SEEN_SERVER_VERSION);
        }
      };
    });
  }

  close(): void {
    if (!this.db) {
      throw new Error(
        `Cannot close database - db is undefined. ` +
          `This indicates open() was never called or failed silently.`,
      );
    }
    this.db.close();
  }

  transaction(
    storeNames: string | Iterable<string>,
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ): IDBTransaction {
    if (!this.db) {
      throw new Error(
        `Cannot open transaction - database not initialized. ` +
          `Requested stores: ${JSON.stringify([...storeNames])}, mode: ${mode}. ` +
          `Call await repository.open(dbName) first.`,
      );
    }
    return this.db?.transaction(storeNames, mode, options);
  }

  async saveRow(
    tx: IDBTransaction,
    tableName: string,
    rowKey: ValidKey,
    row: ORMapRow,
  ): Promise<void> {
    validateTransactionStores(tx, [ROWS_STORE]);
    if (tableName.length <= 0 || !tableName) {
      throw new Error("tableName must be set when saving row");
    }
    if (!row) throw new Error("Row must be set when saving a row");
    if (!row.fields) throw new Error("Row must have fields when saving a row");

    const store = tx.objectStore(ROWS_STORE);

    // TODO: Move business logic to CRDTDatabase
    // Only save if the row has data or a tombstone
    if (Object.keys(row.fields).length > 0 || row.tombstone) {
      await promisifyIDBRequest(store.put({ tableName, rowKey, row }));
    } else {
      // Remove empty rows
      await promisifyIDBRequest(store.delete([
        tableName,
        rowKey as IDBValidKey, /*Casting is fine here since ValidKey is a subset of IDBValidKey*/
      ]));
    }
  }

  async deleteRow() {
  }

  async getRow(tx: IDBTransaction, tableName: string, rowKey: ValidKey): Promise<ORMapRow> {
    validateTransactionStores(tx, [ROWS_STORE]);
    if (tableName.length <= 0 || !tableName) {
      throw new Error("tableName must be set when getting row");
    }
    if (!rowKey) throw new Error("RowKey must be set when getting Row");

    const store = tx.objectStore(ROWS_STORE);
    const result = await promisifyIDBRequest(store.get([
      tableName,
      rowKey as IDBValidKey, /*Casting is fine here since ValidKey is a subset of IDBValidKey*/
    ]));

    return result?.row ?? { fields: {} };
  }

  async saveOperation(tx: IDBTransaction, operation: CRDTOperation): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    if (!operation) {
      throw new Error("CRDTOperation must be set when saving row");
    }

    const store = tx.objectStore(OPERATIONS_STORE);
    await promisifyIDBRequest(store.add({
      op: operation,
      // Note: Using 0/1 instead of false/true due to fake-indexeddb
      // limitation with boolean IDBKeyRange
      synced: SYNCED_STATUS.NOT_SYNCED, // 0 = not synced, 1 = synced
    }));
    return;
  }

  async batchSaveOperations(tx: IDBTransaction, operations: CRDTOperation[]): Promise<void> {
    const savePromises: Promise<void>[] = [];
    for (const operation of operations) {
      savePromises.push(this.saveOperation(tx, operation));
    }

    await Promise.all(savePromises);
    return;
  }

  async saveOperationAsSynced(tx: IDBTransaction, operationDot: Dot): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE], "readwrite");

    const store = tx.objectStore(OPERATIONS_STORE);
    const key = [operationDot.clientId, operationDot.version];
    const record = await promisifyIDBRequest(store.get(key));

    if (!record) {
      // Operation doesn't exist - this is fine, it might have been from a previous sync
      return;
    }

    await promisifyIDBRequest(store.put({ ...record, synced: SYNCED_STATUS.SYNCED }));
  }

  async getUnsyncedOperations(tx: IDBTransaction): Promise<CRDTOperation[]> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_SYNCED_INDEX);

    const result: CRDTOperation[] = [];
    // Note: Using 0/1 instead of false/true due to fake-indexeddb
    // limitation with boolean IDBKeyRange
    const cursorRequest = index.openCursor(IDBKeyRange.only(SYNCED_STATUS.NOT_SYNCED)); // 0 = not synced

    for await (const record of asyncCursorIterator<{ op: CRDTOperation }>(cursorRequest)) {
      result.push(record.op);
    }

    return result;
  }

  async getUnsyncedOperationsByClient(tx: IDBTransaction, clientId: string): Promise<CRDTOperation[]> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_CLIENT_SYNCED_INDEX);

    const result: CRDTOperation[] = [];
    // Query using compound index [clientId, synced]
    // Note: Using 0/1 instead of false/true due to fake-indexeddb limitation
    const cursorRequest = index.openCursor(IDBKeyRange.only([clientId, SYNCED_STATUS.NOT_SYNCED]));

    for await (const record of asyncCursorIterator<{ op: CRDTOperation }>(cursorRequest)) {
      result.push(record.op);
    }

    return result;
  }

  async getAllOperations(tx: IDBTransaction): Promise<CRDTOperation[]> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);

    const result: CRDTOperation[] = [];
    const cursorRequest = store.openCursor();

    for await (const record of asyncCursorIterator<{ op: CRDTOperation }>(cursorRequest)) {
      result.push(record.op);
    }

    return result;
  }

  async getClientState(
    tx: IDBTransaction,
  ): Promise<{ clientId: string; lastSeenServerVersion: number }> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE]);
    const store = tx.objectStore(CLIENT_STATE_STORE);

    const clientId = await promisifyIDBRequest(store.get(CLIENT_ID));
    const lastSeenServerVersion = await promisifyIDBRequest(store.get(LAST_SEEN_SERVER_VERSION));

    return { clientId, lastSeenServerVersion };
  }

  async saveClientId(tx: IDBTransaction, clientId: string): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(clientId, CLIENT_ID));
  }

  async saveServerVersion(tx: IDBTransaction, newServerVersion: number): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(newServerVersion, LAST_SEEN_SERVER_VERSION));
  }

  async getVersion(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE]);
    const store = tx.objectStore(CLIENT_STATE_STORE);
    const version = await promisifyIDBRequest(store.get(LOGICAL_CLOCK));

    if (version === undefined) {
      throw new Error("Version should never be undefined since it's initialized to -1");
    }
    if (version < -1) {
      throw new Error("Version could never be less than initialized value -1. Got: " + version);
    }
    return version;
  }

  async setVersion(tx: IDBTransaction, version: number): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(version, LOGICAL_CLOCK));

    return version;
  }
}
