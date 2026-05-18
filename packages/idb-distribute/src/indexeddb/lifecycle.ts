import {
  hashIndexDefinitions,
  IndexDefinition,
  indexDefinitionToIDBIndex,
  needIndexUpdate,
} from "../indexes.ts";
import { promisifyIDBRequest, validateTransactionStores } from "../utils.ts";
import { ROW_KEY, TABLE_NAME } from "../crdt.ts";

// Stores
export const ROWS_STORE = "rows";
export const OPERATIONS_STORE = "operations";
export const CLIENT_STATE_STORE = "clientState";

// Indexes
export const BY_TABLE_INDEX = "by-table";
const BY_SYNCED_INDEX = "by-synced";
const BY_CLIENT_SYNCED_INDEX = "by-client-synced";

// Client state keys
const LOGICAL_CLOCK = "logicalClock";
const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";
export const INDEXES_HASH = "indexesHash";

export class Lifecycle {
  db: IDBDatabase | undefined;
  indexes?: IndexDefinition[];

  constructor(indexes?: IndexDefinition[]) {
    if (indexes) this.indexes = indexes;
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

        if (!db.objectStoreNames.contains(ROWS_STORE)) {
          const rowStore = db.createObjectStore(ROWS_STORE, {
            keyPath: [TABLE_NAME, ROW_KEY],
          });
          rowStore.createIndex(BY_TABLE_INDEX, TABLE_NAME, { unique: false });
        }

        if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
          const operationStore = db.createObjectStore(OPERATIONS_STORE, {
            keyPath: ["op.dot.clientId", "op.dot.version"],
          });
          operationStore.createIndex(BY_SYNCED_INDEX, "synced", { unique: false });
          operationStore.createIndex(BY_CLIENT_SYNCED_INDEX, ["op.dot.clientId", "synced"], {
            unique: false,
          });
        }

        if (!db.objectStoreNames.contains(CLIENT_STATE_STORE)) {
          const store = db.createObjectStore(CLIENT_STATE_STORE);
          store.put(-1, LOGICAL_CLOCK);
          store.put(-1, LAST_SEEN_SERVER_VERSION);
        }

        const tx = request.transaction!;
        validateTransactionStores(tx, [ROWS_STORE, CLIENT_STATE_STORE], "versionchange");

        const clientStateStore = tx.objectStore(CLIENT_STATE_STORE);
        const rowStore = tx.objectStore(ROWS_STORE);

        if (this.indexes && this.indexes.length > 0) {
          for (const index of this.indexes) {
            const [internalIndexName, keyPath] = indexDefinitionToIDBIndex(index);

            if (!rowStore.indexNames.contains(internalIndexName)) {
              rowStore.createIndex(internalIndexName, keyPath, { unique: false });
            }
          }
        }

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
    return this.db.transaction(storeNames, mode, options);
  }

  commit(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.commit();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(
          new Error(
            `Transaction aborted. ` +
              `Error: ${tx.error?.message || "unknown"}. ` +
              `This usually indicates a constraint violation or concurrent modification.`,
          ),
        );
    });
  }
}
