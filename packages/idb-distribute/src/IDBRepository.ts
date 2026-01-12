import { CRDTOperation, ORMapRow, ValidKey } from "./crdt";
import { asyncCursorIterator, promisifyIDBRequest } from "./utils";

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
        if (!db.objectStoreNames.contains("rows")) {
          const rowStore = db.createObjectStore("rows", { keyPath: ["tableName", "rowKey"] });
          rowStore.createIndex("by-table", "tableName", { unique: false });
        }

        // Store operations log
        if (!db.objectStoreNames.contains("operations")) {
          const opStore = db.createObjectStore("operations", {
            keyPath: "id",
            autoIncrement: true,
          });
          opStore.createIndex("by-synced", "synced", { unique: false });
          opStore.createIndex("by-timestamp", "timestamp", { unique: false });
        }

        // Store client state
        if (!db.objectStoreNames.contains("clientState")) {
          const s = db.createObjectStore("clientState");
          // clientId
          s.put(-1, "logicalClock");
          s.put(-1, "lastSeenServerVersion");
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

  async saveRow(tx: IDBTransaction, tableName: string, rowKey: ValidKey, row: ORMapRow): Promise<void> {
    if (!tx.objectStoreNames.contains("rows")) {
      throw new Error("Transaction is missing rows objectStore");
    }
    if (tableName.length <= 0 || !tableName) {
      throw new Error("tableName must be set when saving row");
    }
    if (!row) throw new Error("Row must be set when saving a row");
    if (!row.fields) throw new Error("Row must have fields when saving a row");

    const store = tx.objectStore("rows");

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
    if (!tx.objectStoreNames.contains("rows")) {
      throw new Error("Transaction is missing rows objectStore");
    }
    if (tableName.length <= 0 || !tableName) {
      throw new Error("tableName must be set when saving row");
    }
    if (!rowKey) throw new Error("RowKey must be set when getting Row");

    const store = tx.objectStore("rows");
    const result = await promisifyIDBRequest(store.get([
      tableName,
      rowKey as IDBValidKey, /*Casting is fine here since ValidKey is a subset of IDBValidKey*/
    ]));

    return result?.row ?? { fields: {} };
  }

  async logOperation(tx: IDBTransaction, op: CRDTOperation): Promise<void> {
    if (!tx.objectStoreNames.contains("operations")) {
      throw new Error("Transaction is missing operations objectStore");
    }
    if (!op) {
      throw new Error("CRDTOperation must be set when saving row");
    }

    const store = tx.objectStore("operations");
    await promisifyIDBRequest(store.add({
      op,
      timestamp: Date.now(),
      synced: 0, // 0 = not synced, 1 = synced
    }));
    return;
  }

  async getUnsyncedOperations(tx: IDBTransaction): Promise<CRDTOperation[]> {
    const store = tx.objectStore("operations");
    const index = store.index("by-synced");
    
    const result: CRDTOperation[] = [];
    // Note: Using 0/1 instead of false/true due to fake-indexeddb limitation with boolean IDBKeyRange
    const cursorRequest = index.openCursor(IDBKeyRange.only(0)); // 0 = not synced
    
    for await (const record of asyncCursorIterator<{ op: CRDTOperation }>(cursorRequest)) {
      result.push(record.op);
    }

    return result;
  }

  async getClientState(
    tx: IDBTransaction,
  ): Promise<{ clientId: string; lastSeenServerVersion: number }> {
    if (!tx.objectStoreNames.contains("clientState")) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    const store = tx.objectStore("clientState");

    const clientId = await promisifyIDBRequest(store.get("clientId"));
    const lastSeenServerVersion = await promisifyIDBRequest(store.get("lastSeenServerVersion"));

    return { clientId, lastSeenServerVersion };
  }

  async saveClientId(tx: IDBTransaction, clientId: string): Promise<void> {
    if (!tx.objectStoreNames.contains("clientState")) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    if (tx.mode !== "readwrite") {
      throw new Error("Transaction must be 'readwrite' to saveClientId");
    }
    const store = tx.objectStore("clientState");

    await promisifyIDBRequest(store.put(clientId, "clientId"));
  }

  async getVersion(tx: IDBTransaction): Promise<number> {
    if (!tx.objectStoreNames.contains("clientState")) {
      throw new Error("Transaction is missing clientState objectStore");
    }

    const store = tx.objectStore("clientState");
    const version = await promisifyIDBRequest(store.get("logicalClock"));

    if (version === undefined) {
      throw new Error("Version should never be undefined since it's initialized to -1");
    }
    if (version < -1) {
      throw new Error("Version could never be less than initialized value -1. Got: " + version);
    }
    return version;
  }

  async setVersion(tx: IDBTransaction, version: number): Promise<number> {
    if (!tx.objectStoreNames.contains("clientState")) {
      throw new Error("Transaction is missing clientState objectStore");
    }
    if (tx.mode !== "readwrite") {
      throw new Error("Transaction must be 'readwrite' to saveClientId");
    }
    const store = tx.objectStore("clientState");
    await promisifyIDBRequest(store.put(version, "logicalClock"));
    return version;
  }
}
