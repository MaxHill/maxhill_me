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
      type: "set",
      table: "users",
      rowKey: "u1",
      field: "name",
      value: "Alice",
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
      type: "set",
      table: "users",
      rowKey: "u1",
      field: "name",
      value: "Alice",
      dot: { clientId: "c1", version: 1 },
    };

    const saveTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveOperation(saveTx, op);
    await lifecycle.commit(saveTx);

    const syncTx = lifecycle.transaction(OPERATIONS_STORE, "readwrite");
    await log.saveOperationAsSynced(syncTx, op.dot);
    await lifecycle.commit(syncTx);

    const getTx = lifecycle.transaction(OPERATIONS_STORE, "readonly");
    const ops = await log.getUnsyncedOperations(getTx);
    await lifecycle.commit(getTx);

    expect(ops).toHaveLength(0);
  });

  it("batch saves operations and counts unsynced", async () => {
    const ops: CRDTOperation[] = [
      { type: "set", table: "users", rowKey: "u1", field: "name", value: "A", dot: { clientId: "c1", version: 1 } },
      { type: "set", table: "users", rowKey: "u2", field: "name", value: "B", dot: { clientId: "c1", version: 2 } },
      { type: "set", table: "users", rowKey: "u3", field: "name", value: "C", dot: { clientId: "c1", version: 3 } },
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
      type: "set", table: "users", rowKey: "u1", field: "name", value: "A",
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
