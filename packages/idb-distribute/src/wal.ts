import type { IDBPDatabase, IDBPTransaction } from "idb";
import { dbCommands, dbQueries, type InternalDbSchema } from "./db.ts";
import * as logicalClock from "./persistedLogicalClock.ts";
import type { WALEntry } from "./types.ts";

export class WAL {
  private generateId: () => string;

  constructor(
    generateId: () => string = crypto.randomUUID.bind(crypto),
  ) {
    this.generateId = generateId;
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
      const lastAppliedVersion = await dbQueries.getLastAppliedVersionTx(tx as any);

      const from = lastAppliedVersion + 1;
      const entries = await this.getEntries(from, tx as any);

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
        await dbCommands.putLastAppliedVersion(tx as any, highestApplied);

        // loop again to check for more
      } catch (err) {
        // If tx fails, throw — do not advance lastAppliedVersion
        throw err;
      }
    }
  }

  async getEntries(
    from: number = 0,
    tx: IDBPTransaction<InternalDbSchema, ["_wal", ...[]], "readwrite" | "readonly">,
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
}
