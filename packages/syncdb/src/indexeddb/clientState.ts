import { assert } from "@maxhill/stdx";
import { promisifyIDBRequest, validateTransactionStores } from "../utils.ts";
import { CLIENT_STATE_STORE } from "./lifecycle.ts";

const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";
const CLIENT_ID = "clientId";
const LOGICAL_CLOCK = "logicalClock";
const LAST_MUTATION_ID = "lastMutationID";
const LAST_GENERATED_MUTATION_ID = "lastGeneratedMutationID";

export class ClientState {
  async getClientState(
    tx: IDBTransaction,
  ): Promise<{
    clientId: string;
    lastSeenServerVersion: number;
    lastMutationID: number;
    lastGeneratedMutationID: number;
  }> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE]);
    const store = tx.objectStore(CLIENT_STATE_STORE);

    const clientId = await promisifyIDBRequest(store.get(CLIENT_ID));
    const lastSeenServerVersion = await promisifyIDBRequest(
      store.get(LAST_SEEN_SERVER_VERSION),
    );
    const lastMutationID = await promisifyIDBRequest(store.get(LAST_MUTATION_ID));
    const lastGeneratedMutationID = await promisifyIDBRequest(
      store.get(LAST_GENERATED_MUTATION_ID),
    );

    assert(
      Number.isSafeInteger(lastMutationID) && lastMutationID >= 0,
      "Invalid acknowledged mutation frontier",
    );
    assert(
      Number.isSafeInteger(lastGeneratedMutationID) &&
        lastGeneratedMutationID >= lastMutationID,
      "Invalid generated mutation frontier",
    );
    return {
      clientId,
      lastSeenServerVersion,
      lastMutationID,
      lastGeneratedMutationID,
    };
  }

  async saveClientId(tx: IDBTransaction, clientId: string): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(clientId, CLIENT_ID));
  }

  async saveServerVersion(tx: IDBTransaction, newServerVersion: number): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(newServerVersion, LAST_SEEN_SERVER_VERSION));
  }

  async getLastMutationID(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE]);
    const store = tx.objectStore(CLIENT_STATE_STORE);
    return await promisifyIDBRequest(store.get(LAST_MUTATION_ID));
  }

  async setLastMutationID(tx: IDBTransaction, mutationID: number): Promise<void> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);
    const current = await promisifyIDBRequest<number>(store.get(LAST_MUTATION_ID));
    const generated = await promisifyIDBRequest<number>(store.get(LAST_GENERATED_MUTATION_ID));
    assert(
      Number.isSafeInteger(mutationID) && mutationID >= current && mutationID <= generated,
      "Invalid acknowledged mutation frontier",
    );
    await promisifyIDBRequest(store.put(mutationID, LAST_MUTATION_ID));
  }

  async allocateMutationID(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);
    const current = await promisifyIDBRequest<number>(store.get(LAST_GENERATED_MUTATION_ID));
    const next = current + 1;
    assert(Number.isSafeInteger(current) && current >= 0 && Number.isSafeInteger(next),
      "Mutation ID must remain a safe integer");
    await promisifyIDBRequest(store.put(next, LAST_GENERATED_MUTATION_ID));
    return next;
  }

  async getVersion(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE]);
    const store = tx.objectStore(CLIENT_STATE_STORE);
    const version = await promisifyIDBRequest(store.get(LOGICAL_CLOCK));

    assert(version !== undefined, "Version should never be undefined since it's initialized to -1");
    assert(
      version >= -1,
      "Version could never be less than initialized value -1. Got: " + version,
    );
    return version;
  }

  async setVersion(tx: IDBTransaction, version: number): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(version, LOGICAL_CLOCK));

    return version;
  }
}
