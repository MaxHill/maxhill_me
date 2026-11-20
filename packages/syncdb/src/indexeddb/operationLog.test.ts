import { vi } from "vitest";
import { OperationLog } from "./operationLog.ts";
import { Lifecycle, OPERATIONS_STORE } from "./lifecycle.ts";
import { CRDTOperation } from "../crdt.ts";
import "fake-indexeddb/auto";

describe("OperationLog", () => {
  let lifecycle: Lifecycle;
  let log: OperationLog;
  const dbName = "oplog-test";

  beforeEach(async () => {
    if (lifecycle?.db) lifecycle.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);
    log = new OperationLog();
  });

  it("refuses pending records without a mutation ID instead of omitting them", async () => {
    const transaction = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    transaction.objectStore(OPERATIONS_STORE).add({
      operation: { type: "setRow", tableName: "users", rowKey: "bad",
        fields: { name: "kept" }, dot: { clientId: "c1", version: 1 } },
      synced: 0,
    });
    await lifecycle.commit(transaction);
    await expect(log.getPendingMutationsByClient(
      lifecycle.transaction(OPERATIONS_STORE), "c1",
    )).rejects.toThrow("mutation ID");
  });

  it("stores and retrieves pending mutations ordered by dense mutationID", async () => {
    const op = (version: number): CRDTOperation => ({
      type: "setRow",
      tableName: "users",
      rowKey: `u${version}`,
      fields: { name: String(version) },
      dot: { clientId: "c1", version },
    });

    const tx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveLocalPendingOperation(tx, op(2), 2);
    await log.saveLocalPendingOperation(tx, op(1), 1);
    await lifecycle.commit(tx);

    const readTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const pending = await log.getPendingMutationsByClient(readTx, "c1");
    await lifecycle.commit(readTx);

    expect(pending.map((p) => p.mutationID)).toEqual([1, 2]);
  });

  it("deletes acknowledged pending mutations through frontier", async () => {
    const tx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    for (let i = 1; i <= 3; i++) {
      await log.saveLocalPendingOperation(tx, {
        type: "setRow",
        tableName: "users",
        rowKey: `u${i}`,
        fields: { name: String(i) },
        dot: { clientId: "c1", version: i },
      }, i);
    }
    await log.deletePendingMutationsThrough(tx, "c1", 2);
    await lifecycle.commit(tx);

    const readTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const pending = await log.getPendingMutationsByClient(readTx, "c1");
    await lifecycle.commit(readTx);

    expect(pending.map((p) => p.mutationID)).toEqual([3]);
  });

  it("batches row checkpoints in one synced-record scan and preserves uncovered operations", async () => {
    const acceptedBeforeCutoff: CRDTOperation = {
      type: "setRow", tableName: "users", rowKey: "u1", fields: { name: "old" },
      dot: { clientId: "c1", version: 1 }, serverVersion: 3,
    };
    const acceptedAtCutoff: CRDTOperation = {
      type: "setRow", tableName: "users", rowKey: "u1", fields: { name: "boundary" },
      dot: { clientId: "c1", version: 5 }, serverVersion: 5,
    };
    const checkpoints: Extract<CRDTOperation, { type: "checkpointRow" }>[] = [
      { type: "checkpointRow", tableName: "users", rowKey: "u1", dot: { clientId: "server", version: 6 }, checkpointSeenServerVersion: 5, fields: {} },
    ];
    const writeTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveRemoteOperation(writeTx, acceptedBeforeCutoff);
    await log.saveRemoteOperation(writeTx, acceptedAtCutoff);
    await lifecycle.commit(writeTx);

    const cleanupTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    const storeIndex = vi.spyOn(IDBObjectStore.prototype, "index");
    await log.deleteCoveredAcceptedOperations(cleanupTx, checkpoints);
    expect(storeIndex).toHaveBeenCalledWith("by-synced");
    storeIndex.mockRestore();
    await lifecycle.commit(cleanupTx);

    const allTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const remaining = await log.getAllOperations(allTx);
    await lifecycle.commit(allTx);
    expect(remaining.map((op) => op.dot.version)).toEqual([5]);
  });
});
