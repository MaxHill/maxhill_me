import { assert } from "@maxhill/stdx";
import {
  hashIndexDefinitions,
  IndexDefinition,
  indexDefinitionToIDBIndex,
  needIndexUpdate,
} from "../indexes.ts";
import { abortFailedTransaction, promisifyIDBRequest } from "../utils.ts";
import { ROW_KEY, TABLE_NAME } from "../crdt.ts";

// Stores
export const ROWS_STORE = "rows";
export const OPERATIONS_STORE = "operations";
export const CLIENT_STATE_STORE = "clientState";

// Indexes
export const BY_TABLE_INDEX = "by-table";
const BY_SYNCED_INDEX = "by-synced";
const BY_CLIENT_SYNCED_INDEX = "by-client-synced";
const REQUIRED_STORES = [ROWS_STORE, OPERATIONS_STORE, CLIENT_STATE_STORE] as const;

// Client state keys
const LOGICAL_CLOCK = "logicalClock";
const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";
const SYNC_PROTOCOL_VERSION = "syncProtocolVersion";
const LAST_MUTATION_ID = "lastMutationID";
const LAST_GENERATED_MUTATION_ID = "lastGeneratedMutationID";
const SYNC_PROTOCOL_VERSION_CURRENT = 4;
export const INDEXES_HASH = "indexesHash";

export class Lifecycle {
  db: IDBDatabase | undefined;
  indexes?: IndexDefinition[];

  constructor(indexes?: IndexDefinition[]) {
    if (indexes) {this.indexes = indexes;}
  }

  private validateIndexDefinitions(): void {
    if (!this.indexes) {return;}

    const indexNames = this.indexes.map((index) =>
      `table: ${index.table}, indexName: ${index.name}`
    );
    const duplicateIndexNames = indexNames.filter((tableAndName, index) =>
      indexNames.indexOf(tableAndName) !== index
    );

    assert(
      duplicateIndexNames.length === 0,
      `Index names must be unique per table, found the following duplicates: \n   ${
        duplicateIndexNames.join("\n  ")
      }`,
    );

    for (const index of this.indexes) {
      assert(index.name, "Index name cannot be empty");
      assert(index.name.trim() !== "", "Index name cannot be empty");

      assert(index.table, `Index "${index.name}": table name cannot be empty`);
      assert(index.table.trim() !== "", `Index "${index.name}": table name cannot be empty`);

      assert(index.keys, `Index "${index.name}": keys array cannot be empty`);
      assert(index.keys.length > 0, `Index "${index.name}": keys array cannot be empty`);

      for (const key of index.keys) {
        assert(key, `Index "${index.name}": key name cannot be empty`);
        assert(key.trim() !== "", `Index "${index.name}": key name cannot be empty`);
      }
    }
  }

  async open(dbName: string, version?: number): Promise<IDBDatabase> {
    this.validateIndexDefinitions();
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.completeOpen(request.result, dbName, version).then((db) => {
          this.db = db;
          resolve(db);
        }, reject);
      };
      request.onupgradeneeded = (event) => {
        this.upgradeDatabase(request, event.oldVersion).catch((error) => {
          abortFailedTransaction(request.transaction!);
          reject(error);
        });
      };
    });
  }

  private async completeOpen(db: IDBDatabase, name: string, version?: number) {
    try {
      if (REQUIRED_STORES.some((store) => !db.objectStoreNames.contains(store))) {
        throw new Error("Database is missing required object stores; existing data was preserved");
      }
      await this.assertSupportedProtocolState(db);
      const transaction = db.transaction(CLIENT_STATE_STORE);
      const upgradeNeeded = await needIndexUpdate(transaction, this.indexes);
      if (upgradeNeeded) {
        if (version !== undefined) {
          throw new Error("Database indexes were not successfully updated");
        }
        const nextVersion = db.version + 1;
        db.close();
        return await this.open(name, nextVersion);
      }
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private async upgradeDatabase(request: IDBOpenDBRequest, oldVersion: number) {
    const db = request.result;
    const transaction = request.transaction!;
    if (oldVersion > 0) {
      if (REQUIRED_STORES.some((store) => !db.objectStoreNames.contains(store))) {
        throw new Error("Database is missing required object stores; existing data was preserved");
      }
      const state = transaction.objectStore(CLIENT_STATE_STORE);
      const protocol = await promisifyIDBRequest(state.get(SYNC_PROTOCOL_VERSION));
      if (protocol !== SYNC_PROTOCOL_VERSION_CURRENT) {
        throw new Error("Unsupported local sync store protocol; existing data was preserved");
      }
      await this.validateMutationState(state);
      this.validateOperationStore(transaction.objectStore(OPERATIONS_STORE));
    }
    this.createStores(db);
    this.createApplicationIndexes(transaction);
    await promisifyIDBRequest(transaction.objectStore(CLIENT_STATE_STORE).put(
      hashIndexDefinitions(this.indexes), INDEXES_HASH,
    ));
  }

  private createStores(db: IDBDatabase): void {
    if (!db.objectStoreNames.contains(ROWS_STORE)) {
      const store = db.createObjectStore(ROWS_STORE, { keyPath: [TABLE_NAME, ROW_KEY] });
      store.createIndex(BY_TABLE_INDEX, TABLE_NAME);
    }
    if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
      const store = db.createObjectStore(OPERATIONS_STORE, {
        keyPath: ["operation.dot.clientId", "operation.dot.version"],
      });
      store.createIndex(BY_SYNCED_INDEX, "synced");
      store.createIndex(BY_CLIENT_SYNCED_INDEX, ["operation.dot.clientId", "synced"]);
      store.createIndex("by-client-mutation", ["operation.dot.clientId", "mutationID"], {
        unique: true,
      });
    }
    if (!db.objectStoreNames.contains(CLIENT_STATE_STORE)) {
      const store = db.createObjectStore(CLIENT_STATE_STORE);
      store.put(-1, LOGICAL_CLOCK);
      store.put(-1, LAST_SEEN_SERVER_VERSION);
      store.put(SYNC_PROTOCOL_VERSION_CURRENT, SYNC_PROTOCOL_VERSION);
      store.put(0, LAST_MUTATION_ID);
      store.put(0, LAST_GENERATED_MUTATION_ID);
    }
  }

  private createApplicationIndexes(transaction: IDBTransaction): void {
    const store = transaction.objectStore(ROWS_STORE);
    for (const index of this.indexes ?? []) {
      const [name, keyPath] = indexDefinitionToIDBIndex(index);
      if (!store.indexNames.contains(name)) {
        store.createIndex(name, keyPath);
      }
    }
  }

  private validateOperationStore(store: IDBObjectStore): void {
    const expected = ["operation.dot.clientId", "operation.dot.version"];
    if (JSON.stringify(store.keyPath) !== JSON.stringify(expected) ||
        !store.indexNames.contains("by-client-mutation") ||
        !store.index("by-client-mutation").unique ||
        JSON.stringify(store.index("by-client-mutation").keyPath) !==
          JSON.stringify(["operation.dot.clientId", "mutationID"])) {
      throw new Error("Unsupported operation store schema; existing data was preserved");
    }
  }

  private async validateMutationState(store: IDBObjectStore): Promise<void> {
    const [acknowledged, generated, clientId] = await Promise.all([
      promisifyIDBRequest<number>(store.get(LAST_MUTATION_ID)),
      promisifyIDBRequest<number>(store.get(LAST_GENERATED_MUTATION_ID)),
      promisifyIDBRequest<string | undefined>(store.get("clientId")),
    ]);
    if (!Number.isSafeInteger(acknowledged) || acknowledged < 0 ||
        !Number.isSafeInteger(generated) || generated < acknowledged ||
        (generated > 0 && !clientId)) {
      throw new Error("Invalid local mutation state; existing data was preserved");
    }
  }

  private async assertSupportedProtocolState(db: IDBDatabase): Promise<void> {
    const tx = db.transaction([CLIENT_STATE_STORE, ROWS_STORE, OPERATIONS_STORE], "readonly");
    const clientState = tx.objectStore(CLIENT_STATE_STORE);

    const protocolVersion = await promisifyIDBRequest<number | undefined>(
      clientState.get(SYNC_PROTOCOL_VERSION),
    );

    if (protocolVersion === SYNC_PROTOCOL_VERSION_CURRENT) {
      this.validateOperationStore(tx.objectStore(OPERATIONS_STORE));
      await this.validateMutationState(clientState);
      return;
    }

    throw new Error(
      `Unsupported local sync store protocol: ${protocolVersion ?? "uninitialized"}. ` +
        `Open a fresh empty database for protocol ${SYNC_PROTOCOL_VERSION_CURRENT}. ` +
        "Existing data was preserved.",
    );
  }

  close(): void {
    assert(
      this.db,
      `Cannot close database - db is undefined. ` +
        `This indicates open() was never called or failed silently.`,
    );
    this.db.close();
  }

  transaction(
    storeNames: string | Iterable<string>,
    mode?: IDBTransactionMode,
    options?: IDBTransactionOptions,
  ): IDBTransaction {
    assert(
      this.db,
      `Cannot open transaction - database not initialized. ` +
        `Requested stores: ${JSON.stringify([...storeNames])}, mode: ${mode}. ` +
        `Call await repository.open(dbName) first.`,
    );
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
