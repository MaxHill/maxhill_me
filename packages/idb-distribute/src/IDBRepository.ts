import { CRDTOperation, Dot, ORMapRow, ROW_KEY, TABLE_NAME, ValidKey } from "./crdt.ts";
import {
  createIndexName,
  hashIndexDefinitions,
  IndexDefinition,
  indexDefinitionToIDBIndex,
  needIndexUpdate,
  QueryCondition,
  queryToIDBRange,
} from "./indexes.ts";
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
export const BY_TABLE_INDEX = "by-table";
const BY_SYNCED_INDEX = "by-synced";
const BY_CLIENT_SYNCED_INDEX = "by-client-synced";

// Client state keys
const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";
const CLIENT_ID = "clientId";
const LOGICAL_CLOCK = "logicalClock";
export const INDEXES_HASH = "indexesHash";

export class IDBRepository {
  db: IDBDatabase | undefined;
  indexes?: IndexDefinition[];

  constructor(indexes?: IndexDefinition[]) {
    this.indexes = indexes;
  }

  private validateIndexDefinitions(): void {
    if (!this.indexes) return;

    const indexNames = this.indexes.map((index) =>
      `table: ${index.table}, indexName: ${index.name}`
    );
    const duplicateIndexNames = indexNames.filter((tableAndName, index) =>
      indexNames.indexOf(tableAndName) !== index
    );

    if (duplicateIndexNames.length > 0) {
      throw new Error(
        `Index names must be unique per table, found the following duplicates: \n   ${
          duplicateIndexNames.join("\n  ")
        }`,
      );
    }

    for (const index of this.indexes) {
      if (!index.name || index.name.trim() === "") {
        throw new Error("Index name cannot be empty");
      }

      if (!index.table || index.table.trim() === "") {
        throw new Error(`Index "${index.name}": table name cannot be empty`);
      }

      if (!index.keys || index.keys.length === 0) {
        throw new Error(`Index "${index.name}": keys array cannot be empty`);
      }

      for (const key of index.keys) {
        if (!key || key.trim() === "") {
          throw new Error(`Index "${index.name}": key name cannot be empty`);
        }
      }
    }
  }

  async open(dbName: string, version?: number): Promise<IDBDatabase> {
    const self = this;

    return new Promise((resolve, reject) => {
      // Validate index definitions before opening
      this.validateIndexDefinitions();

      const request = indexedDB.open(dbName, version);

      request.onerror = () => reject(request.error);
      request.onsuccess = async () => {
        var db = request.result;

        const tx = db.transaction([CLIENT_STATE_STORE], "readonly");
        const upgradeNeeded = await needIndexUpdate(tx, this.indexes);
        if (upgradeNeeded && version) {
          throw new Error(
            "Database indexes where not successfully updated, got a new version and non-matching indexes",
          );
        } else if (upgradeNeeded) {
          db.close();
          db = await self.open(dbName, db.version + 1);
        }

        this.db = db;
        resolve(this.db);
      };

      request.onupgradeneeded = async (event) => {
        const request = event.target as IDBOpenDBRequest;
        const db = request.result;

        // ROWS_STORE will store the actual crdt representation of a piece of data
        if (!db.objectStoreNames.contains(ROWS_STORE)) {
          const rowStore = db.createObjectStore(ROWS_STORE, {
            keyPath: [TABLE_NAME, ROW_KEY],
          });
          rowStore.createIndex(BY_TABLE_INDEX, TABLE_NAME, { unique: false });
        }

        // OPERATIONS_STORE is used to store the crdt operations that
        // will be applied to the rows in ROWS_STORE
        if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
          const operationStore = db.createObjectStore(OPERATIONS_STORE, {
            keyPath: ["op.dot.clientId", "op.dot.version"],
          });
          operationStore.createIndex(BY_SYNCED_INDEX, "synced", { unique: false });
          operationStore.createIndex(BY_CLIENT_SYNCED_INDEX, ["op.dot.clientId", "synced"], {
            unique: false,
          });
        }

        // Inititalizes the client state to default values
        if (!db.objectStoreNames.contains(CLIENT_STATE_STORE)) {
          const store = db.createObjectStore(CLIENT_STATE_STORE);
          // Don't store INDEXES_HASH here - it will be stored later if indexes exist
          // or remain unset if no indexes are defined
          store.put(-1, LOGICAL_CLOCK);
          store.put(-1, LAST_SEEN_SERVER_VERSION);
        }

        // Always update the indexes hash to track index definitions
        const tx = request.transaction!;
        validateTransactionStores(tx, [ROWS_STORE, CLIENT_STATE_STORE], "versionchange");

        const clientStateStore = tx.objectStore(CLIENT_STATE_STORE);
        const rowStore = tx.objectStore(ROWS_STORE);

        if (this.indexes && this.indexes.length > 0) {
          // TODO: remove old indexes

          // adds new user defined indexes
          for (const index of this.indexes) {
            const [internalIndexName, keyPath] = indexDefinitionToIDBIndex(index);

            if (!rowStore.indexNames.contains(internalIndexName)) {
              rowStore.createIndex(internalIndexName, keyPath, { unique: false });
            }
          }
        }

        // Always store the hash (even if empty) to track index state
        await promisifyIDBRequest(
          clientStateStore.put(hashIndexDefinitions(this.indexes), INDEXES_HASH),
        );
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
    row: ORMapRow,
  ): Promise<void> {
    validateTransactionStores(tx, [ROWS_STORE]);
    if (row[TABLE_NAME].length <= 0 || !row[TABLE_NAME]) {
      throw new Error("table name must be set when saving row");
    }
    if (row[ROW_KEY].length <= 0 || !row[ROW_KEY]) {
      throw new Error("row key must be set when saving row");
    }
    if (!row) throw new Error("Row must be set when saving a row");
    if (!row.fields) throw new Error("Row must have fields when saving a row");

    const store = tx.objectStore(ROWS_STORE);

    // TODO: Move business logic to CRDTDatabase
    // Only save if the row has data or a tombstone
    if (Object.keys(row.fields).length > 0 || row.tombstone) {
      await promisifyIDBRequest(store.put(row));
    } else {
      // Remove empty rows
      await promisifyIDBRequest(store.delete([
        row[TABLE_NAME],
        row[
          ROW_KEY
        ] as IDBValidKey, /*Casting is fine here since ValidKey is a subset of IDBValidKey*/
      ]));
    }
  }

  query(
    tx: IDBTransaction,
    table: string,
    query: QueryCondition,
    indexName?: string,
  ): AsyncIterableIterator<ORMapRow> {
    validateTransactionStores(tx, [ROWS_STORE]);
    const indexNames = (this.indexes || []).map((index) => index.name);
    if (indexName && !indexNames.includes(indexName)) {
      throw new Error(
        `Specified index ${indexName} does not exist in indexes:/n${
          indexNames.map((index) => `   ${index} /n`)
        }`,
      );
    }

    let source: IDBObjectStore | IDBIndex = tx.objectStore(ROWS_STORE);
    if (indexName) {
      source = source.index(createIndexName(table, indexName));
    }

    const range = queryToIDBRange(table, query);
    const cursorRequest = source.openCursor(range);
    return asyncCursorIterator<ORMapRow>(cursorRequest);
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
      rowKey as IDBValidKey, // Casting is safe here since ValidKey is a subset of IDBValidKey
    ]));

    return result ?? { [TABLE_NAME]: tableName, [ROW_KEY]: rowKey, fields: {} };
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

  async countUnsyncedOperations(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_SYNCED_INDEX);

    // Use count() instead of iterating through all operations
    const countRequest = index.count(IDBKeyRange.only(SYNCED_STATUS.NOT_SYNCED));
    return await promisifyIDBRequest(countRequest);
  }

  async getUnsyncedOperationsByClient(
    tx: IDBTransaction,
    clientId: string,
  ): Promise<CRDTOperation[]> {
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

  /**
   * Resets the client's sync state. This clears all operations and resets
   * the lastSeenServerVersion to -1.
   *
   * Use this when the client's state is out of sync with the server
   * (e.g., after a server database reset).
   *
   * Transaction requirements:
   * - Stores: [CLIENT_STATE_STORE, OPERATIONS_STORE]
   * - Mode: "readwrite"
   */
  async resetSyncState(tx: IDBTransaction): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE, OPERATIONS_STORE], "readwrite");

    // Clear all operations
    const operationsStore = tx.objectStore(OPERATIONS_STORE);
    await promisifyIDBRequest(operationsStore.clear());

    // Reset lastSeenServerVersion to -1
    const clientStateStore = tx.objectStore(CLIENT_STATE_STORE);
    await promisifyIDBRequest(clientStateStore.put(-1, LAST_SEEN_SERVER_VERSION));

    console.warn(
      "Client sync state has been reset. All local unsynced operations have been cleared.",
    );
  }
}
