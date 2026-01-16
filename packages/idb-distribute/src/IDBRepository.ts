import { CRDTOperation, ORMapRow, ValidKey } from "./crdt";
import { asyncCursorIterator, promisifyIDBRequest } from "./utils";

// Stores
const ROWS_STORE = "rows";
const OPERATIONS_STORE = "operations";
const CLIENT_STATE_STORE = "clientState";

// Indexes
const BY_TABLE_INDEX = "by-table";
const BY_SYNCED_INDEX = "by-synced";
const BY_TIMESTAMP_INDEX = "by-timestamp";

// Client state keys
const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";
const CLIENT_ID = "clientId";
const LOGICAL_CLOCK = "logicalClock";

export class IDBRepository {
  db: IDBDatabase | undefined;

  async open(dbName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

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
          const opStore = db.createObjectStore(OPERATIONS_STORE, {
            keyPath: "id",
            autoIncrement: true,
          });
          opStore.createIndex(BY_SYNCED_INDEX, "synced", { unique: false });
          opStore.createIndex(BY_TIMESTAMP_INDEX, "timestamp", { unique: false });
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
    if (!this.db) throw new Error("Cannot close database without database");
    this.db.close();
  }

  transaction(
    storeNames: string | Iterable<string>,
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ): IDBTransaction {
    if (!this.db) throw new Error("Cannot open transaction without database");
    return this.db?.transaction(storeNames, mode, options);
  }

  async saveRow(
    tx: IDBTransaction,
    tableName: string,
    rowKey: ValidKey,
    row: ORMapRow,
  ): Promise<void> {
    if (!tx.objectStoreNames.contains(ROWS_STORE)) {
      throw new Error("Transaction is missing rows objectStore");
    }
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

  async getRow(tx: IDBTransaction, tableName: string, rowKey: ValidKey): Promise<ORMapRow> {
    if (!tx.objectStoreNames.contains(ROWS_STORE)) {
      throw new Error("Transaction is missing rows objectStore");
    }
    if (tableName.length <= 0 || !tableName) {
      throw new Error("tableName must be set when saving row");
    }
    if (!rowKey) throw new Error("RowKey must be set when getting Row");

    const store = tx.objectStore(ROWS_STORE);
    const result = await promisifyIDBRequest(store.get([
      tableName,
      rowKey as IDBValidKey, /*Casting is fine here since ValidKey is a subset of IDBValidKey*/
    ]));

    return result?.row ?? { fields: {} };
  }

  async logOperation(tx: IDBTransaction, op: CRDTOperation): Promise<void> {
    if (!tx.objectStoreNames.contains(OPERATIONS_STORE)) {
      throw new Error("Transaction is missing operations objectStore");
    }
    if (!op) {
      throw new Error("CRDTOperation must be set when saving row");
    }

    const store = tx.objectStore(OPERATIONS_STORE);
    await promisifyIDBRequest(store.add({
      op,
      timestamp: Date.now(),
      // Note: Using 0/1 instead of false/true due to fake-indexeddb
      // limitation with boolean IDBKeyRange
      synced: 0, // 0 = not synced, 1 = synced
    }));
    return;
  }

  async saveOperationAsSynced(tx: IDBTransaction, operationId: string) {
  }

  async getUnsyncedOperations(tx: IDBTransaction): Promise<CRDTOperation[]> {
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_SYNCED_INDEX);

    const result: CRDTOperation[] = [];
    // Note: Using 0/1 instead of false/true due to fake-indexeddb
    // limitation with boolean IDBKeyRange
    const cursorRequest = index.openCursor(IDBKeyRange.only(0)); // 0 = not synced

    for await (const record of asyncCursorIterator<{ op: CRDTOperation }>(cursorRequest)) {
      result.push(record.op);
    }

    return result;
  }

  async getClientState(
    tx: IDBTransaction,
  ): Promise<{ clientId: string; lastSeenServerVersion: number }> {
    if (!tx.objectStoreNames.contains(CLIENT_STATE_STORE)) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    const store = tx.objectStore(CLIENT_STATE_STORE);

    const clientId = await promisifyIDBRequest(store.get(CLIENT_ID));
    const lastSeenServerVersion = await promisifyIDBRequest(store.get(LAST_SEEN_SERVER_VERSION));

    return { clientId, lastSeenServerVersion };
  }

  async saveClientId(tx: IDBTransaction, clientId: string): Promise<void> {
    if (!tx.objectStoreNames.contains(CLIENT_STATE_STORE)) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    if (tx.mode !== "readwrite") {
      throw new Error("Transaction must be 'readwrite' to saveClientId");
    }
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(clientId, CLIENT_ID));
  }

  async saveServerVersion(tx: IDBTransaction, newServerVersion: number): Promise<void> {
    if (!tx.objectStoreNames.contains(CLIENT_STATE_STORE)) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    if (tx.mode !== "readwrite") {
      throw new Error("Transaction must be 'readwrite' to saveClientId");
    }
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(newServerVersion, LAST_SEEN_SERVER_VERSION));
  }

  async getVersion(tx: IDBTransaction): Promise<number> {
    if (!tx.objectStoreNames.contains(CLIENT_STATE_STORE)) {
      throw new Error("Transaction is missing clientState objectStore");
    }

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
    if (!tx.objectStoreNames.contains(CLIENT_STATE_STORE)) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    if (tx.mode !== "readwrite") {
      throw new Error("Transaction must be 'readwrite' to saveClientId");
    }
    const store = tx.objectStore(CLIENT_STATE_STORE);
    await promisifyIDBRequest(store.put(version, LOGICAL_CLOCK));
    return version;
  }
}
