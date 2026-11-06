import { OperationLog } from "./operationLog.ts";
import { Lifecycle, OPERATIONS_STORE, CLIENT_STATE_STORE } from "./lifecycle.ts";
import { CRDTOperation } from "../crdt.ts";
import "fake-indexeddb/auto";

describe("OperationLog", () => {
  let lifecycle: Lifecycle;
  let log: OperationLog;
  const dbName = "oplog-test";

  beforeEach(async () => {
    if (lifecycle?.db) {
      lifecycle.close();
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);
    log = new OperationLog();
  });

  it("saves an operation and retrieves it as unsynced", async () => {
    const op: CRDTOperation = {
      type: "setRow",
      tableName: "users",
      rowKey: "u1",
      fields: { ["name"]: "Alice" },
      dot: { clientId: "c1", version: 1 },
    };

    const saveTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveOperation(saveTx, op);
    await lifecycle.commit(saveTx);

    const getTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const ops = await log.getUnsyncedOperations(getTx);
    await lifecycle.commit(getTx);

    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual(op);
  });

  it("marks an operation as synced so it no longer appears in unsynced", async () => {
    const op: CRDTOperation = {
      type: "setRow",
      tableName: "users",
      rowKey: "u1",
      fields: { ["name"]: "Alice" },
      dot: { clientId: "c1", version: 1 },
    };

    const saveTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveOperation(saveTx, op);
    await lifecycle.commit(saveTx);

    const syncTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveOperationAsSynced(syncTx, op.dot, 4);
    await lifecycle.commit(syncTx);

    const getTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const ops = await log.getUnsyncedOperations(getTx);
    await lifecycle.commit(getTx);

    expect(ops).toHaveLength(0);
  });

  it("deletes only accepted operations covered by a row checkpoint", async () => {
    const accepted: CRDTOperation = {
      type: "setRow", tableName: "users", rowKey: "u1", fields: { name: "old" },
      dot: { clientId: "c1", version: 1 },
    };
    const pending: CRDTOperation = {
      type: "setRow", tableName: "users", rowKey: "u1", fields: { name: "pending" },
      dot: { clientId: "c1", version: 2 },
    };
    const otherRow: CRDTOperation = {
      type: "setRow", tableName: "users", rowKey: "u2", fields: { name: "other" },
      dot: { clientId: "c1", version: 3 },
    };
    const writeTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveOperation(writeTx, accepted);
    await log.saveOperation(writeTx, pending);
    await log.saveOperation(writeTx, otherRow);
    await log.saveOperationAsSynced(writeTx, accepted.dot, 3);
    await log.saveOperationAsSynced(writeTx, otherRow.dot, 3);
    await lifecycle.commit(writeTx);

    const cleanupTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.deleteCoveredAcceptedOperations(cleanupTx, "users", "u1", 4);
    await lifecycle.commit(cleanupTx);
    const allTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const remaining = await log.getAllOperations(allTx);
    await lifecycle.commit(allTx);
    expect(remaining.map((op) => op.dot.version).sort()).toEqual([2, 3]);
  });

  it("batch saves operations and counts unsynced", async () => {
    const ops: CRDTOperation[] = [
      { type: "setRow", tableName: "users", rowKey: "u1", fields: { name: "A" }, dot: { clientId: "c1", version: 1 } },
      { type: "setRow", tableName: "users", rowKey: "u2", fields: { name: "B" }, dot: { clientId: "c1", version: 2 } },
      { type: "setRow", tableName: "users", rowKey: "u3", fields: { name: "C" }, dot: { clientId: "c1", version: 3 } },
    ];

    const saveTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.batchSaveOperations(saveTx, ops);
    await lifecycle.commit(saveTx);

    const countTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const count = await log.countUnsyncedOperations(countTx);
    await lifecycle.commit(countTx);

    expect(count).toBe(3);
  });

  it("resets sync state clearing all operations", async () => {
    const op: CRDTOperation = {
      type: "setRow", tableName: "users", rowKey: "u1", fields: { name: "A" },
      dot: { clientId: "c1", version: 1 },
    };

    const saveTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveOperation(saveTx, op);
    await lifecycle.commit(saveTx);

    const resetTx = lifecycle.transaction([OPERATIONS_STORE, CLIENT_STATE_STORE], "readwrite");
    await log.resetSyncState(resetTx);
    await lifecycle.commit(resetTx);

    const getTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const ops = await log.getUnsyncedOperations(getTx);
    await lifecycle.commit(getTx);

    expect(ops).toHaveLength(0);
  });
});
