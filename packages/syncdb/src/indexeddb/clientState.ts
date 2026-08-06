import { promisifyIDBRequest, validateTransactionStores } from "../utils.ts";
import { CLIENT_STATE_STORE } from "./lifecycle.ts";

const LAST_SEEN_SERVER_VERSION = "lastSeenServerVersion";
const CLIENT_ID = "clientId";
const LOGICAL_CLOCK = "logicalClock";

export class ClientState {
  async getClientState(
    tx: IDBTransaction,
  ): Promise<{ clientId: string; lastSeenServerVersion: number }> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE]);
    const store = tx.objectStore(CLIENT_STATE_STORE);

    const clientId = await promisifyIDBRequest(store.get(CLIENT_ID));
    const lastSeenServerVersion = await promisifyIDBRequest(store.get(LAST_SEEN_SERVER_VERSION));

    return { clientId, lastSeenServerVersion };
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

  async getVersion(tx: IDBTransaction): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE]);
    const store = tx.objectStore(CLIENT_STATE_STORE);
    const version = await promisifyIDBRequest(store.get(LOGICAL_CLOCK));

    if (version === undefined) {
      throw new Error("Version should never be undefined since it's initialized to -1");
    }
    if (version < -1) {
      throw new Error("Version could never be less than initialized value -1. Got: " + version);
    }
    return version;
  }

  async setVersion(tx: IDBTransaction, version: number): Promise<number> {
    validateTransactionStores(tx, [CLIENT_STATE_STORE], "readwrite");
    const store = tx.objectStore(CLIENT_STATE_STORE);

    await promisifyIDBRequest(store.put(version, LOGICAL_CLOCK));

    return version;
  }
}
