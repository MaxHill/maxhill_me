import { Lifecycle, CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE } from "./lifecycle.ts";
import { abortFailedTransaction, promisifyIDBRequest } from "../utils.ts";
import { type Dot, type ORMapRow } from "../crdt.ts";
import { jsonValuesEqual } from "../json-values-equal.ts";

const IMPORT_SOURCE = "drainedImportSource";
const REPLACED_STATE = new Set([
  "clientId", "syncProtocolVersion", "lastMutationID", "lastGeneratedMutationID",
  "lastSeenServerVersion", "indexesHash",
]);

type Snapshot = { rows: unknown[]; state: Array<[IDBValidKey, unknown]> };

/** Call only after every legacy tab is closed and every replica is fully acknowledged. */
export async function migrateDrainedReplica(
  sourceName: string | undefined, targetName: string,
): Promise<void> {
  if (sourceName === targetName) {
    throw new Error("Drained migration requires a separate local database");
  }
  // Probe without reconciling indexes: reopening an imported store must not upgrade it.
  const target = await openExistingDatabase(targetName) ?? await new Lifecycle().open(targetName);
  try {
    if (isImported(await readTargetMarker(target), sourceName)) {return;}
    await importSnapshot(target, sourceName, await readSnapshot(sourceName));
  } finally {
    target.close();
  }
}

async function readTargetMarker(target: IDBDatabase): Promise<unknown> {
  const probe = target.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
  const probeCompleted = transactionCompleted(probe);
  const [marker, protocol] = await Promise.all([
    promisifyIDBRequest(probe.objectStore(CLIENT_STATE_STORE).get(IMPORT_SOURCE)),
    promisifyIDBRequest(probe.objectStore(CLIENT_STATE_STORE).get("syncProtocolVersion")),
  ]);
  const operations = probe.objectStore(OPERATIONS_STORE);
  if (protocol !== 4 || JSON.stringify(operations.keyPath) !==
      JSON.stringify(["operation.dot.clientId", "operation.dot.version"]) ||
      !operations.indexNames.contains("by-client-mutation") ||
      !operations.index("by-client-mutation").unique ||
      JSON.stringify(operations.index("by-client-mutation").keyPath) !==
        JSON.stringify(["operation.dot.clientId", "mutationID"])) {
    throw new Error("Unsupported migration target schema; both stores were preserved");
  }
  await probeCompleted;
  return marker;
}

async function readSnapshot(sourceName: string | undefined): Promise<Snapshot> {
  const source = sourceName ? await openExistingDatabase(sourceName) : undefined;
  let rows: unknown[] = [];
  let state: Array<[IDBValidKey, unknown]> = [];
  if (source) {
    try {
      const transaction = source.transaction(
        [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE], "readonly",
      );
      const sourceCompleted = transactionCompleted(transaction);
      void sourceCompleted.catch(() => {});
      const clientState = transaction.objectStore(CLIENT_STATE_STORE);
      const operations = transaction.objectStore(OPERATIONS_STORE);
      if (JSON.stringify(transaction.objectStore(ROWS_STORE).keyPath) !==
          JSON.stringify(["table_name", "row_key"])) {
        throw new Error("Unsupported legacy row schema; source was preserved");
      }
      if (JSON.stringify(operations.keyPath) !==
          JSON.stringify(["op.dot.clientId", "op.dot.version"])) {
        throw new Error("Unsupported legacy operation schema; source was preserved");
      }
      const [protocol, records, sourceRows, keys, values] = await Promise.all([
        promisifyIDBRequest(clientState.get("syncProtocolVersion")),
        promisifyIDBRequest<{ synced: number }[]>(operations.getAll()),
        promisifyIDBRequest<unknown[]>(transaction.objectStore(ROWS_STORE).getAll()),
        promisifyIDBRequest(clientState.getAllKeys()),
        promisifyIDBRequest(clientState.getAll()),
      ]);
      if (protocol !== 3) {
        throw new Error("Only legacy local protocol 3 can be migrated; source was preserved");
      }
      if (records.some((record) => record.synced !== 1)) {
        throw new Error("Legacy operations are pending or invalid; finish old sync first");
      }
      state = keys.map((key, index) => [key, values[index]]);
      const clock = values[keys.indexOf("logicalClock")];
      if (!Number.isSafeInteger(clock) || clock < -1) {
        throw new Error("Invalid legacy logical clock; source was preserved");
      }
      let observedClock = clock;
      for (const row of sourceRows) {
        observedClock = validateSnapshotRow(row, observedClock);
      }
      state = state.map(([key, value]) => [key, key === "logicalClock" ? observedClock : value]);
      rows = sourceRows;
      await sourceCompleted;
    } finally {
      source.close();
    }
  }

  return { rows, state };
}

async function importSnapshot(
  target: IDBDatabase, sourceName: string | undefined, { rows, state }: Snapshot,
): Promise<void> {
  const transaction = target.transaction(
    [CLIENT_STATE_STORE, ROWS_STORE, OPERATIONS_STORE], "readwrite",
  );
  const completed = transactionCompleted(transaction);
  // Attach rejection handling before issuing requests; abort can race a request failure.
  void completed.catch(() => {});
  try {
    const clientState = transaction.objectStore(CLIENT_STATE_STORE);
    if (!isImported(await promisifyIDBRequest(clientState.get(IMPORT_SOURCE)), sourceName)) {
      const [rowCount, operationCount, clientId] = await Promise.all([
        promisifyIDBRequest(transaction.objectStore(ROWS_STORE).count()),
        promisifyIDBRequest(transaction.objectStore(OPERATIONS_STORE).count()),
        promisifyIDBRequest(clientState.get("clientId")),
      ]);
      if (rowCount || operationCount || clientId) {
        throw new Error("Migration target is not empty; both stores were preserved");
      }
      for (const row of rows) {
        await promisifyIDBRequest(transaction.objectStore(ROWS_STORE).add(row));
      }
      for (const [key, value] of state) {
        if (typeof key !== "string" || !REPLACED_STATE.has(key)) {
          await promisifyIDBRequest(clientState.put(value, key));
        }
      }
      // Retain original field dots and clock, but never reuse the retired replica identity.
      await promisifyIDBRequest(clientState.put(crypto.randomUUID(), "clientId"));
      await promisifyIDBRequest(clientState.put({ sourceName: sourceName ?? null }, IMPORT_SOURCE));
    }
    await completed;
  } catch (error) {
    abortFailedTransaction(transaction);
    await completed.catch(() => {});
    throw error;
  }
}

function transactionCompleted(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Drained import aborted"));
  });
}

function isImported(value: unknown, sourceName: string | undefined): boolean {
  if (value === undefined) {return false;}
  if (value !== null && typeof value === "object" &&
      "sourceName" in value && value.sourceName === (sourceName ?? null)) {
    return true;
  }
  throw new Error("Migration target belongs to a different source; both stores were preserved");
}

function validateSnapshotRow(value: unknown, clock: number): number {
  const row = value as ORMapRow;
  let observedClock = clock;
  const dotValid = (dot: Dot) => {
    const valid = dot && typeof dot.clientId === "string" && dot.clientId !== "" &&
      Number.isSafeInteger(dot.version) && dot.version >= 0;
    if (valid) {observedClock = Math.max(observedClock, dot.version);}
    return valid;
  };
  if (!row || typeof row.table_name !== "string" || !row.table_name ||
      typeof row.row_key !== "string" || !row.fields || Array.isArray(row.fields) ||
      typeof row.fields !== "object" || !jsonValuesEqual(row.fields, row.fields)) {
    throw new Error("Unsupported legacy row; source was preserved");
  }
  for (const field of Object.values(row.fields)) {
    if (!field || !dotValid(field.dot) || !jsonValuesEqual(field.value, field.value)) {
      throw new Error("Invalid legacy field or clock; source was preserved");
    }
  }
  if (row.tombstone !== undefined) {
    const vector = row.tombstone?.versionVector;
    if (!dotValid(row.tombstone?.dot) || !vector || typeof vector !== "object" ||
        Array.isArray(vector) || !jsonValuesEqual(vector, vector) ||
        Object.entries(vector).some(([clientId, version]) =>
          !clientId || !Number.isSafeInteger(version) || version < 0)) {
      throw new Error("Invalid legacy tombstone; source was preserved");
    }
    for (const version of Object.values(vector)) {
      observedClock = Math.max(observedClock, version);
    }
  }
  return observedClock;
}

function openExistingDatabase(name: string): Promise<IDBDatabase | undefined> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let absent = false;
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction!.abort();
    };
    request.onerror = () => absent ? resolve(undefined) : reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
