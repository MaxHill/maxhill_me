import type { IDBPDatabase, IDBPTransaction } from "idb";
import { dbCommands, dbQueries, type InternalDbSchema } from "./db.ts";
import * as logicalClock from "./persistedLogicalClock.ts";
import type { WALOperation } from "./types.ts";

export class WAL {
  private generateId: () => string;

  constructor(
    generateId: () => string = crypto.randomUUID.bind(crypto),
  ) {
    this.generateId = generateId;
  }

  async writeNewOperation(
    tx: IDBPTransaction<
      InternalDbSchema,
      ["_wal", "_logicalClock", "_clientId", ...[]],
      "readwrite"
    >,
    operation: Omit<WALOperation, "key" | "version" | "clientId">,
  ): Promise<number> {
    console.error("WALOPERATION", operation);

    const clientId = await dbQueries.getClientIdTx(tx);

    const version = await logicalClock.tick(tx);
    const walStore = tx.objectStore("_wal");
    await walStore.add({
      ...operation,
      key: this.generateId(),
      version,
      clientId,
    });

    return version;
  }

  async applyPendingOperations(tx: IDBPTransaction<any, string[], "readwrite">) {
    while (true) {
      // get last applied version inside the given transaction
      const lastAppliedVersion = await dbQueries.getLastAppliedVersionTx(tx as any);

      const from = lastAppliedVersion + 1;
      const operations = await this.getOperations(from, tx as any);

      if (!operations || !operations.length) {
        // nothing more to apply, exit
        return;
      }

      const BATCH_LIMIT = 1000;
      const batch = operations.slice(0, BATCH_LIMIT);

      // group by table
      const groups = batch.reduce<Record<string, WALOperation[]>>((acc, e) => {
        (acc[e.table] ||= []).push(e);
        return acc;
      }, {});

      try {
        // Apply each group's operations using the provided transaction
        for (const table of Object.keys(groups)) {
          const store = tx.objectStore(table);
          for (const operation of groups[table]) {
            if (operation.operation === "put" && store.keyPath) {
              store.put(operation.value);
            } else if (operation.operation === "put" && !store.keyPath) {
              store.put(operation.value, operation.valueKey);
            } else if (operation.operation === "del") {
              store.delete(operation.value);
            } else if (operation.operation === "clear") {
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

  async getOperations(
    from: number = 0,
    tx: IDBPTransaction<InternalDbSchema, ["_wal", ...[]], "readwrite" | "readonly">,
  ): Promise<WALOperation[]> {
    const transaction = tx as IDBPTransaction<InternalDbSchema, ["_wal"], "readwrite" | "readonly">;
    const store = transaction.objectStore("_wal").index("version");
    const operations = await store.getAll(IDBKeyRange.lowerBound(from));

    if (!tx) {
      await transaction.done;
    }

    const sorted = operations.toSorted((a, b) => {
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

  async batchWriteSyncedOperations(
    operations: WALOperation[],
    tx: IDBPTransaction<InternalDbSchema, ["_wal", ...any[]], "readwrite">,
    chunkSize = 500,
  ) {
    for (let i = 0; i < operations.length; i += chunkSize) {
      const chunk = operations.slice(i, i + chunkSize);
      const store = tx.objectStore("_wal");

      for (const operation of chunk) {
        await store.add(operation);
      }
    }
  }
}
