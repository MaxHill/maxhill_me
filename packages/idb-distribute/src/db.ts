import {
  type DBSchema,
  type IDBPDatabase,
  type IDBPObjectStore,
  type IDBPTransaction,
  openDB,
  type OpenDBCallbacks,
  type StoreNames,
} from "idb";
import { WAL } from "./wal.ts";
import type { WALOperation } from "./types.ts";

//  ------------------------------------------------------------------------
//  Types
//  ------------------------------------------------------------------------
// This is defined as a runtime object to be able to exclude
// the stores when clearing user defined stores in the wal
export interface InternalDbSchema extends DBSchema {
  "_lastAppliedVersion": {
    key: "value";
    value: number;
  };
  "_lastSyncedVersion": {
    key: "value";
    value: number;
  };
  "_logicalClock": {
    key: "value";
    value: number;
  };
  "_wal": {
    key: IDBValidKey;
    value: WALOperation;
    indexes: {
      version: number;
      table: string;
      operation: string;
      serverVersion: number;
    };
  };
  "_clientId": {
    key: "value";
    value: string;
  };
}

export const INTERNAL_DB_STORES: (keyof InternalDbSchema)[] = [
  "_lastAppliedVersion",
  "_lastSyncedVersion",
  "_logicalClock",
  "_wal",
  "_clientId",
];

//  ------------------------------------------------------------------------
//  Commands
//  ------------------------------------------------------------------------
export const dbCommands = {
  async putLastSyncedVersion(
    tx: IDBPTransaction<InternalDbSchema, ["_lastSyncedVersion", ...any[]], "readwrite">,
    version: number,
  ): Promise<void> {
    let store = tx.objectStore("_lastSyncedVersion");
    await store.put(version, "value");
  },
  async putLastAppliedVersion(
    tx: IDBPTransaction<InternalDbSchema, ["_lastAppliedVersion", ...any[]], "readwrite">,
    version: number,
  ): Promise<void> {
    let store = tx.objectStore("_lastAppliedVersion");
    await store.put(version, "value");
  },
};

//  ------------------------------------------------------------------------
//  Queries
//  ------------------------------------------------------------------------
export const dbQueries = {
  async getLastSyncedVersionTx(
    tx: IDBPTransaction<
      InternalDbSchema,
      ["_lastSyncedVersion", ...any[]],
      "readwrite" | "readonly"
    >,
  ): Promise<number> {
    const store = tx.objectStore("_lastSyncedVersion");
    return (await store.get("value")) ?? -1;
  },
  async getLastAppliedVersionTx(
    tx: IDBPTransaction<
      InternalDbSchema,
      ["_lastAppliedVersion", ...any[]],
      "readwrite" | "readonly"
    >,
  ): Promise<number> {
    const store = tx.objectStore("_lastAppliedVersion");
    return (await store.get("value")) ?? -1;
  },
  async getClientIdTx(
    tx: IDBPTransaction<InternalDbSchema, ["_clientId", ...any[]], "readwrite" | "readonly">,
  ): Promise<string> {
    let store = tx.objectStore("_clientId");
    let clientId = await store.get("value");
    if (!clientId) {
      throw new Error("No client id exists");
    }
    return clientId;
  },
  async getLastSeenServerVersion(
    tx: IDBPTransaction<InternalDbSchema, ["_wal", ...any[]], "readwrite" | "readonly">,
  ): Promise<number> {
    // const tx = db.transaction('_wal', 'readonly');
    const store = tx.objectStore("_wal") as IDBPObjectStore<
      InternalDbSchema,
      ["_wal"],
      "_wal",
      "readwrite" | "readonly"
    >;
    const index = (store as any).index("serverVersion");

    // Open a cursor on the serverVersion index in descending order
    const cursor = await index.openCursor(null, "prev");

    if (cursor) {
      // cursor.value is the WALOperation with the highest serverVersion
      return cursor.value.serverVersion || -1;
    }

    // If no entries, return -1 or whatever default makes sense
    return -1;
  },
};

//  ------------------------------------------------------------------------
//   Setup
//  ------------------------------------------------------------------------

/**
 * Open a unified IndexedDB database that includes both user-defined tables
 * and the library's metadata tables.
 *
 * API is identical to `idb.openDB`.
 */
export async function openAppDb<TUserSchema>(
  name: string,
  version: number,
  callbacks: OpenDBCallbacks<TUserSchema> = {},
  generateId: () => string = crypto.randomUUID.bind(crypto),
): Promise<IDBPDatabase<InternalDbSchema & TUserSchema>> {
  // Open with full schema internally
  const db = await openDB<InternalDbSchema>(name, version, {
    ...callbacks,
    upgrade(db, oldVersion, newVersion, tx, event) {
      // Ensure metadata stores
      if (!db.objectStoreNames.contains("_lastAppliedVersion")) {
        const s = db.createObjectStore("_lastAppliedVersion");
        s.put(-1, "value");
      }
      if (!db.objectStoreNames.contains("_lastSyncedVersion")) {
        const s = db.createObjectStore("_lastSyncedVersion");
        s.put(-1, "value");
      }
      if (!db.objectStoreNames.contains("_logicalClock")) {
        const s = db.createObjectStore("_logicalClock");
        s.put(-1, "value");
      }
      if (!db.objectStoreNames.contains("_clientId")) {
        const s = db.createObjectStore("_clientId");
        s.put(generateId(), "value");
      }
      if (!db.objectStoreNames.contains("_wal")) {
        const s = db.createObjectStore("_wal", { keyPath: "key" });
        s.createIndex("version", "version");
        s.createIndex("table", "table");
        s.createIndex("operation", "operation");
        s.createIndex("serverVersion", "serverVersion");
      }

      // Proxy the db to prevent autoincrement stores
      const proxiedDb = new Proxy(db, {
        get(target, prop) {
          if (prop === "createObjectStore") {
            return (name: string, options?: IDBObjectStoreParameters) => {
              if (options?.autoIncrement) {
                throw new Error(
                  "Autoincrementing IDs are not supported in distributed systems as they cannot guarantee uniqueness across clients.",
                );
              }
              // Type assertion needed for dynamic store creation
              return (target as any).createObjectStore(name, options);
            };
          }
          return (target as any)[prop];
        },
      });

      // Call user-provided upgrade hook,
      // but with user-only schema
      callbacks.upgrade?.(
        proxiedDb as unknown as IDBPDatabase<TUserSchema>,
        oldVersion,
        newVersion,
        tx as unknown as IDBPTransaction<TUserSchema, StoreNames<TUserSchema>[], "versionchange">,
        event,
      );
    },
  });

  return db as unknown as IDBPDatabase<InternalDbSchema & TUserSchema>;
}
