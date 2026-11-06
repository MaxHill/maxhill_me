import { assert } from "@maxhill/stdx";
import { CRDTOperation, Dot } from "../crdt.ts";
import { asyncCursorIterator, promisifyIDBRequest, validateTransactionStores } from "../utils.ts";
import { OPERATIONS_STORE, CLIENT_STATE_STORE } from "./lifecycle.ts";

const SYNCED_STATUS = {
  NOT_SYNCED: 0,
  SYNCED: 1,
} as const;

const BY_SYNCED_INDEX = "by-synced";
const BY_CLIENT_SYNCED_INDEX = "by-client-synced";
const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";

export class OperationLog {
  async saveOperation(tx: IDBTransaction, operation: CRDTOperation): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    assert(operation, "CRDTOperation must be set when saving row");

    const store = tx.objectStore(OPERATIONS_STORE);
    await promisifyIDBRequest(store.add({
      op: operation,
      synced: operation.serverVersion === undefined ? SYNCED_STATUS.NOT_SYNCED : SYNCED_STATUS.SYNCED,
      ...(operation.serverVersion === undefined ? {} : { serverVersion: operation.serverVersion }),
    }));
  }

  async batchSaveOperations(tx: IDBTransaction, operations: CRDTOperation[]): Promise<void> {
    const savePromises: Promise<void>[] = [];
    for (const operation of operations) {
      savePromises.push(this.saveOperation(tx, operation));
    }
    await Promise.all(savePromises);
  }

  async saveOperationAsSynced(tx: IDBTransaction, operationDot: Dot, serverVersion: number): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE], "readwrite");

    const store = tx.objectStore(OPERATIONS_STORE);
    const key = [operationDot.clientId, operationDot.version];
    const record = await promisifyIDBRequest(store.get(key));

    if (!record) return;

    await promisifyIDBRequest(store.put({ ...record, synced: SYNCED_STATUS.SYNCED, serverVersion }));
  }

  async deleteCoveredAcceptedOperations(
    tx: IDBTransaction,
    checkpoints: readonly Extract<CRDTOperation, { type: "checkpointRow" }>[],
  ): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE], "readwrite");
    if (checkpoints.length === 0) return;

    const cutoffsByTable = new Map<string, Map<string, number>>();
    for (const checkpoint of checkpoints) {
      let cutoffsByRow = cutoffsByTable.get(checkpoint.tableName);
      if (!cutoffsByRow) {
        cutoffsByRow = new Map();
        cutoffsByTable.set(checkpoint.tableName, cutoffsByRow);
      }
      cutoffsByRow.set(
        checkpoint.rowKey,
        Math.max(
          cutoffsByRow.get(checkpoint.rowKey) ?? -1,
          checkpoint.checkpointSeenServerVersion,
        ),
      );
    }

    const store = tx.objectStore(OPERATIONS_STORE);
    const syncedIndex = store.index(BY_SYNCED_INDEX);
    const cursorRequest = syncedIndex.openCursor(IDBKeyRange.only(SYNCED_STATUS.SYNCED));
    for await (const record of asyncCursorIterator<{
      op: CRDTOperation; synced: number; serverVersion?: number;
    }>(cursorRequest)) {
      if (record.serverVersion === undefined) continue;
      const cutoff = cutoffsByTable.get(record.op.tableName)?.get(record.op.rowKey);
      if (cutoff !== undefined && record.serverVersion < cutoff) {
        await promisifyIDBRequest(store.delete([record.op.dot.clientId, record.op.dot.version]));
      }
    }
  }

  async getUnsyncedOperations(tx: IDBTransaction): Promise<CRDTOperation[]> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_SYNCED_INDEX);

    const result: CRDTOperation[] = [];
    const cursorRequest = index.openCursor(IDBKeyRange.only(SYNCED_STATUS.NOT_SYNCED));

    for await (const record of asyncCursorIterator<{ op: CRDTOperation }>(cursorRequest)) {
      result.push(record.op);
    }

    return result;
  }

  async countUnsyncedOperations(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_SYNCED_INDEX);

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

  async resetSyncState(tx: IDBTransaction): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE, OPERATIONS_STORE], "readwrite");

    const operationsStore = tx.objectStore(OPERATIONS_STORE);
    await promisifyIDBRequest(operationsStore.clear());

    const clientStateStore = tx.objectStore(CLIENT_STATE_STORE);
    await promisifyIDBRequest(clientStateStore.put(-1, LAST_SEEN_SERVER_VERSION));

    console.warn(
      "Client sync state has been reset. All local unsynced operations have been cleared.",
    );
  }
}
