import { assert } from "@maxhill/stdx";
import { CRDTOperation } from "../crdt.ts";
import { asyncCursorIterator, promisifyIDBRequest, validateTransactionStores } from "../utils.ts";
import { OPERATIONS_STORE } from "./lifecycle.ts";

const SYNCED_STATUS = {
  NOT_SYNCED: 0,
  SYNCED: 1,
} as const;

const BY_SYNCED_INDEX = "by-synced";
const BY_CLIENT_SYNCED_INDEX = "by-client-synced";
export type PendingMutationRecord = {
  /**
   * This ID stays separate from the logical clock so the server can detect upload gaps and
   * acknowledge a complete prefix.
   */
  mutationID: number;
  operation: CRDTOperation;
};

export class OperationLog {
  async saveRemoteOperation(tx: IDBTransaction, operation: CRDTOperation): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    assert(operation, "CRDTOperation must be set when saving row");
    assert(
      Number.isSafeInteger(operation.serverVersion) && operation.serverVersion! >= 0,
      "Remote operation requires a server version",
    );

    const store = tx.objectStore(OPERATIONS_STORE);
    await promisifyIDBRequest(
      store.add({
        operation: operation,
        synced: SYNCED_STATUS.SYNCED,
        serverVersion: operation.serverVersion,
      }),
    );
  }

  async saveLocalPendingOperation(
    tx: IDBTransaction,
    operation: CRDTOperation,
    mutationID: number,
  ): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE], "readwrite");
    assert(
      operation.serverVersion === undefined,
      "Local pending operation cannot have serverVersion",
    );
    assert(Number.isSafeInteger(mutationID) && mutationID > 0, "Invalid pending mutation ID");

    const store = tx.objectStore(OPERATIONS_STORE);
    await promisifyIDBRequest(
      store.add({
        operation: operation,
        synced: SYNCED_STATUS.NOT_SYNCED,
        mutationID,
      }),
    );
  }

  async batchSaveOperations(tx: IDBTransaction, operations: CRDTOperation[]): Promise<void> {
    const savePromises: Promise<void>[] = [];
    for (const operation of operations) {
      savePromises.push(this.saveRemoteOperation(tx, operation));
    }
    await Promise.all(savePromises);
  }

  async deleteCoveredAcceptedOperations(
    tx: IDBTransaction,
    checkpoints: readonly Extract<CRDTOperation, { type: "checkpointRow" }>[],
  ): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE], "readwrite");
    if (checkpoints.length === 0) {
      return;
    }

    const cutoffsByTable = new Map<string, Map<string, number>>();
    for (const checkpoint of checkpoints) {
      let cutoffsByRow = cutoffsByTable.get(checkpoint.tableName);
      if (!cutoffsByRow) {
        cutoffsByRow = new Map();
        cutoffsByTable.set(checkpoint.tableName, cutoffsByRow);
      }
      cutoffsByRow.set(
        checkpoint.rowKey,
        Math.max(cutoffsByRow.get(checkpoint.rowKey) ?? -1, checkpoint.checkpointSeenServerVersion),
      );
    }

    const store = tx.objectStore(OPERATIONS_STORE);
    const syncedIndex = store.index(BY_SYNCED_INDEX);
    const cursorRequest = syncedIndex.openCursor(IDBKeyRange.only(SYNCED_STATUS.SYNCED));
    for await (const record of asyncCursorIterator<{
      operation: CRDTOperation;
      synced: number;
      serverVersion?: number;
    }>(cursorRequest)) {
      if (record.serverVersion === undefined) {
        continue;
      }
      const cutoff = cutoffsByTable.get(record.operation.tableName)?.get(record.operation.rowKey);
      if (cutoff !== undefined && record.serverVersion < cutoff) {
        await promisifyIDBRequest(
          store.delete([record.operation.dot.clientId, record.operation.dot.version]),
        );
      }
    }
  }

  async countUnsyncedOperations(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_SYNCED_INDEX);

    const countRequest = index.count(IDBKeyRange.only(SYNCED_STATUS.NOT_SYNCED));
    return await promisifyIDBRequest(countRequest);
  }

  async getPendingMutationsByClient(
    tx: IDBTransaction,
    clientId: string,
  ): Promise<PendingMutationRecord[]> {
    validateTransactionStores(tx, [OPERATIONS_STORE]);
    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_CLIENT_SYNCED_INDEX);

    const result: PendingMutationRecord[] = [];
    const cursorRequest = index.openCursor(IDBKeyRange.only([clientId, SYNCED_STATUS.NOT_SYNCED]));

    for await (const record of asyncCursorIterator<{
      operation: CRDTOperation;
      mutationID?: number;
    }>(cursorRequest)) {
      if (!Number.isSafeInteger(record.mutationID) || record.mutationID! <= 0) {
        throw new Error("Pending record is missing a valid mutation ID");
      }
      result.push({ mutationID: record.mutationID!, operation: record.operation });
    }

    result.sort((a, b) => a.mutationID - b.mutationID);
    return result;
  }

  async deletePendingMutationsThrough(
    tx: IDBTransaction,
    clientId: string,
    ackMutationID: number,
  ): Promise<void> {
    validateTransactionStores(tx, [OPERATIONS_STORE], "readwrite");
    assert(
      Number.isSafeInteger(ackMutationID) && ackMutationID >= 0,
      "Invalid acknowledged mutation ID",
    );
    if (ackMutationID === 0) {
      return;
    }

    const store = tx.objectStore(OPERATIONS_STORE);
    const index = store.index(BY_CLIENT_SYNCED_INDEX);
    const cursorRequest = index.openCursor(IDBKeyRange.only([clientId, SYNCED_STATUS.NOT_SYNCED]));

    for await (const record of asyncCursorIterator<{
      operation: CRDTOperation;
      mutationID?: number;
    }>(cursorRequest)) {
      if (record.mutationID !== undefined && record.mutationID <= ackMutationID) {
        await promisifyIDBRequest(
          store.delete([record.operation.dot.clientId, record.operation.dot.version]),
        );
      }
    }
  }
}
