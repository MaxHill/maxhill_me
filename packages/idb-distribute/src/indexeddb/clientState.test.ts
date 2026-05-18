import { ClientState } from "./clientState.ts";
import { Lifecycle, CLIENT_STATE_STORE } from "./lifecycle.ts";
import "fake-indexeddb/auto";

describe("ClientState", () => {
  let lifecycle: Lifecycle;
  let clientState: ClientState;
  const dbName = "clientstate-test";

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
    clientState = new ClientState();
  });

  it("saves and retrieves clientId", async () => {
    const saveTx = lifecycle.transaction(CLIENT_STATE_STORE, "readwrite");
    await clientState.saveClientId(saveTx, "my-client");
    await lifecycle.commit(saveTx);

    const getTx = lifecycle.transaction(CLIENT_STATE_STORE, "readonly");
    const state = await clientState.getClientState(getTx);
    await lifecycle.commit(getTx);

    expect(state.clientId).toBe("my-client");
  });

  it("initializes with lastSeenServerVersion -1 and undefined clientId", async () => {
    const tx = lifecycle.transaction(CLIENT_STATE_STORE, "readonly");
    const state = await clientState.getClientState(tx);
    await lifecycle.commit(tx);

    expect(state.clientId).toBeUndefined();
    expect(state.lastSeenServerVersion).toBe(-1);
  });

  it("saves and retrieves server version", async () => {
    const saveTx = lifecycle.transaction(CLIENT_STATE_STORE, "readwrite");
    await clientState.saveServerVersion(saveTx, 42);
    await lifecycle.commit(saveTx);

    const getTx = lifecycle.transaction(CLIENT_STATE_STORE, "readonly");
    const state = await clientState.getClientState(getTx);
    await lifecycle.commit(getTx);

    expect(state.lastSeenServerVersion).toBe(42);
  });

  it("gets and sets logical clock version", async () => {
    const getTx = lifecycle.transaction(CLIENT_STATE_STORE, "readonly");
    const initial = await clientState.getVersion(getTx);
    await lifecycle.commit(getTx);
    expect(initial).toBe(-1);

    const setTx = lifecycle.transaction(CLIENT_STATE_STORE, "readwrite");
    await clientState.setVersion(setTx, 10);
    await lifecycle.commit(setTx);

    const getTx2 = lifecycle.transaction(CLIENT_STATE_STORE, "readonly");
    const updated = await clientState.getVersion(getTx2);
    await lifecycle.commit(getTx2);
    expect(updated).toBe(10);
  });
});
