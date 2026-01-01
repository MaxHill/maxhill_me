import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction } from "idb";
import { dbCommands, dbQueries, INTERNAL_DB_STORES, type InternalDbSchema } from "./db.ts";
import * as logicalClock from "./persistedLogicalClock.ts";

export interface WALEntry {
  key: IDBValidKey;
  table: string;
  operation: "put" | "del" | "clear";
  value: IDBKeyRange | IDBValidKey | any; // value to write if put or key/keyRange to delete
  valueKey?: IDBValidKey;
  version: number;
  clientId: string;
  readonly serverVersion?: number; // Only set on the server
}

export class WAL {
  private generateId: () => string;
  private sendSyncRequest: (req: SyncRequest) => Promise<SyncResponse> = defaultSendSyncRequest;

  constructor(
    generateId: () => string = crypto.randomUUID.bind(crypto),
    sendSyncRequest: (req: SyncRequest) => Promise<SyncResponse> = defaultSendSyncRequest,
  ) {
    this.generateId = generateId;
    this.sendSyncRequest = sendSyncRequest;
  }

  async writeNewEntry(
    tx: IDBPTransaction<
      InternalDbSchema,
      ["_wal", "_logicalClock", "_clientId", ...[]],
      "readwrite"
    >,
    entry: Omit<WALEntry, "key" | "version" | "clientId">,
  ): Promise<number> {
    const clientId = await dbQueries.getClientIdTx(tx);

    const version = await logicalClock.tick(tx);
    const walStore = tx.objectStore("_wal");
    await walStore.add({
      ...entry,
      key: this.generateId(),
      version,
      clientId,
    });

    return version;
  }

  async applyPendingEntries(tx: IDBPTransaction<any, string[], "readwrite">) {
    while (true) {
      // get last applied version inside the given transaction
      const lastAppliedVersion = await dbQueries.getLastAppliedVersionTx(tx);

      const from = lastAppliedVersion + 1;
      const entries = await this.getEntries(from, tx);

      if (!entries || !entries.length) {
        // nothing more to apply, exit
        return;
      }

      const BATCH_LIMIT = 1000;
      const batch = entries.slice(0, BATCH_LIMIT);

      // group by table
      const groups = batch.reduce<Record<string, WALEntry[]>>((acc, e) => {
        (acc[e.table] ||= []).push(e);
        return acc;
      }, {});

      try {
        // Apply each group's operations using the provided transaction
        for (const table of Object.keys(groups)) {
          const store = tx.objectStore(table);
          for (const entry of groups[table]) {
            if (entry.operation === "put" && store.keyPath) {
              store.put(entry.value);
            } else if (entry.operation === "put" && !store.keyPath) {
              store.put(entry.value, entry.valueKey);
            } else if (entry.operation === "del") {
              store.delete(entry.value);
            } else if (entry.operation === "clear") {
              store.clear();
            }
          }
        }

        // Persist lastAppliedVersion up to the highest version we applied in this batch:
        const highestApplied = batch[batch.length - 1].version;
        await dbCommands.putLastAppliedVersion(tx, highestApplied);

        // loop again to check for more
      } catch (err) {
        // If tx fails, throw — do not advance lastAppliedVersion
        throw err;
      }
    }
  }

  async getEntries(
    from: number = 0,
    tx: IDBPTransaction<InternalDbSchema, ["_wal", ...any[]], "readwrite" | "readonly">,
  ): Promise<WALEntry[]> {
    const transaction = tx as IDBPTransaction<InternalDbSchema, ["_wal"], "readwrite" | "readonly">;
    const store = transaction.objectStore("_wal").index("version");
    const entries = await store.getAll(IDBKeyRange.lowerBound(from));

    if (!tx) {
      await transaction.done;
    }

    const sorted = entries.toSorted((a, b) => {
      if (a.version !== b.version) return a.version - b.version;

      const tableCompare = String(a.table || "").localeCompare(String(b.table || ""));
      if (tableCompare !== 0) return tableCompare;

      const keyCompare = String(a.key).localeCompare(String(b.key));
      if (keyCompare !== 0) return keyCompare;

      const clientCompare = a.clientId.localeCompare(b.clientId);
      if (clientCompare !== 0) return clientCompare;

      if (a.operation !== b.operation) return a.operation === "put" ? -1 : 1;

      return 0;
    });

    return sorted;
  }

  async batchWriteSyncedEntries(
    entries: WALEntry[],
    tx: IDBPTransaction<InternalDbSchema, ["_wal", ...any[]], "readwrite">,
    chunkSize = 500,
  ) {
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      const store = tx.objectStore("_wal");

      for (const entry of chunk) {
        await store.add(entry);
      }
    }
  }

  /**
   * Extract a SyncRequest from the database
   *
   * @param {IDBPDatabase} db - IndexedDbDatabase
   * @returns {SyncRequest} - Sync request populated with the entries that should be sent to the server
   */
  async getEntriesToSync(db: IDBPDatabase): Promise<SyncRequest> {
    const tx = db.transaction(["_clientId", "_lastSyncedVersion", "_wal"]);

    const clientId = await dbQueries.getClientIdTx(tx);
    const lastSyncedVersion = await dbQueries.getLastSyncedVersionTx(tx);

    const entries = await this.getEntries(lastSyncedVersion + 1, tx);
    const toSync = entries.filter((e) => e.clientId === clientId);

    const lastSeenServerVersion = await dbQueries.getLastSeenServerVersion(tx);
    await tx.done;

    return {
      clientId,
      clientLastSeenVersion: lastSeenServerVersion,
      entries: toSync,
    };
  }

  /**
   * @param {IDBPDatabase} db - Database to merge to
   * @param {SyncRequest} request - Request that was made to receive the response
   * @param {SyncResponse} response - Response with the wal entries
   */
  async receiveExternalWALEntries(db: IDBPDatabase, request: SyncRequest, response: SyncResponse) {
    const tx = db.transaction(db.objectStoreNames, "readwrite");
    if (response.entries.length) {
      await this.batchWriteSyncedEntries(response.entries, tx);

      const lowestVersion = response.entries.reduce((prev, curr) => {
        return Math.min(prev, curr.version);
      }, Infinity);

      const lastAppliedVersion = await dbQueries.getLastAppliedVersionTx(tx);

      if (lowestVersion <= lastAppliedVersion) {
        await Promise.all(
          Array.from(db.objectStoreNames).map(async (storeName): Promise<void> => {
            if (INTERNAL_DB_STORES.includes(storeName)) return;
            const store = tx.objectStore(storeName);
            await store.clear();
          }),
        );

        console.info("Database reset, starting re-application of WAL");
        await dbCommands.putLastAppliedVersion(tx, -1);
        await this.applyPendingEntries(tx);
      } else {
        await this.applyPendingEntries(tx);
      }

      // Sync clock
      const highestVersion = response.entries.reduce((prev, curr) => {
        return Math.max(prev, curr.version);
      }, -1);
      await logicalClock.sync(tx, highestVersion);
    }

    // TODO: Can we acheive this without looking at the request?
    if (request.entries.length > 0) {
      const maxVersion = Math.max(...request.entries.map((e) => e.version));
      await dbCommands.putLastSyncedVersion(tx, maxVersion);
    }
    await tx.done;
  }

  async sync(db: IDBPDatabase) {
    const tx1 = db.transaction(["_clientId", "_lastSyncedVersion", "_wal"]);

    const clientId = await dbQueries.getClientIdTx(tx1);
    const lastSyncedVersion = await dbQueries.getLastSyncedVersionTx(tx1);

    let entries = await this.getEntries(lastSyncedVersion + 1, tx1);
    let toSync = entries.filter((e) => e.clientId === clientId);

    const lastSeenServerVersion = await dbQueries.getLastSeenServerVersion(tx1);
    await tx1.done;

    // Send sync event to server
    const res = await this.sendSyncRequest({
      clientId,
      clientLastSeenVersion: lastSeenServerVersion,
      entries: toSync,
    });

    const tx = db.transaction(db.objectStoreNames, "readwrite");
    if (res.entries.length) {
      await this.batchWriteSyncedEntries(res.entries, tx);

      const lowestVersion = res.entries.reduce((prev, curr) => {
        return Math.min(prev, curr.version);
      }, Infinity);

      const lastAppliedVersion = await dbQueries.getLastAppliedVersionTx(tx);

      if (lowestVersion <= lastAppliedVersion) {
        await Promise.all(
          Array.from(db.objectStoreNames).map(async (storeName) => {
            if (INTERNAL_DB_STORES.includes(storeName)) return;
            const store = tx.objectStore(storeName);
            await store.clear();
          }),
        );

        console.info("Database reset, starting re-application of WAL");
        await dbCommands.putLastAppliedVersion(tx, -1);
        await this.applyPendingEntries(tx);
      } else {
        await this.applyPendingEntries(tx);
      }

      // Sync clock
      const highestVersion = res.entries.reduce((prev, curr) => {
        return Math.max(prev, curr.version);
      }, -1);
      await logicalClock.sync(tx, highestVersion);
    }

    if (toSync.length > 0) {
      const maxVersion = Math.max(...toSync.map((e) => e.version));
      await dbCommands.putLastSyncedVersion(tx, maxVersion);
    }
    await tx.done;
  }
}

//  ------------------------------------------------------------------------
//  Send Sync request
//  ------------------------------------------------------------------------
export interface SyncRequest {
  clientId: string;
  entries: WALEntry[];
  clientLastSeenVersion: number;
}

interface SyncResponse {
  entries: WALEntry[];
}

type SyncServerRequest = (req: SyncRequest) => Promise<SyncResponse>;

const defaultSendSyncRequest: SyncServerRequest = async (req) => {
  const body = { ...req, entries: req.entries.map(encodeWALEntry) };
  try {
    const response = await fetch("http://localhost:9900/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    let syncResponse: SyncResponse = await response.json();
    syncResponse = { ...syncResponse, entries: syncResponse.entries.map(decodeWALEntry) };
    return syncResponse;
  } catch (error) {
    console.error("Sync request failed:", error);
    throw error;
  }
};

// Encode key for sending to backend
function encodeKey(key: IDBValidKey): string {
  if (typeof key === "string") {
    return `string:${key}`;
  } else if (typeof key === "number") {
    return `number:${key}`;
  } else if (key instanceof Date) {
    return `json:${JSON.stringify(key.toISOString())}`;
  } else if (key instanceof ArrayBuffer) {
    // Convert ArrayBuffer to base64
    const base64 = btoa(String.fromCharCode(...new Uint8Array(key)));
    return `json:${JSON.stringify(base64)}`;
  } else if (ArrayBuffer.isView(key)) {
    // Handle typed arrays
    const base64 = btoa(String.fromCharCode(...new Uint8Array(key.buffer)));
    return `json:${JSON.stringify(base64)}`;
  } else if (Array.isArray(key)) {
    return `array:${JSON.stringify(key)}`;
  } else {
    return `json:${JSON.stringify(key)}`;
  }
}

// Decode key received from backend
function decodeKey(encoded: string): IDBValidKey {
  const colonIndex = encoded.indexOf(":");
  if (colonIndex === -1) {
    return encoded; // fallback for unprefixed values
  }

  const prefix = encoded.substring(0, colonIndex);
  const value = encoded.substring(colonIndex + 1);

  switch (prefix) {
    case "string": {
      return value;
    }
    case "number": {
      return parseFloat(value);
    }
    case "array": {
      return JSON.parse(value);
    }
    case "json": {
      const parsed = JSON.parse(value);
      // Try to reconstruct Date objects
      if (typeof parsed === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(parsed)) {
        return new Date(parsed);
      }
      return parsed;
    }
    default: {
      return encoded;
    }
  }
}

// Updated prepare function
export function encodeWALEntry(entry: WALEntry): WALEntry {
  return {
    ...entry,
    key: encodeKey(entry.key),
    ...(entry.valueKey != null ? { valueKey: encodeKey(entry.valueKey) } : {}),
  };
}

// Updated reconstruct function
export function decodeWALEntry(entry: WALEntry): WALEntry {
  return {
    ...entry,
    key: decodeKey(entry.key as string),
    ...(entry.valueKey != null ? { valueKey: decodeKey(entry.valueKey as string) } : {}),
  };
}
