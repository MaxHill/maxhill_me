import { Lifecycle, ROWS_STORE, OPERATIONS_STORE, CLIENT_STATE_STORE } from "./lifecycle.ts";
import "fake-indexeddb/auto";

describe("Lifecycle", () => {
  let lifecycle: Lifecycle;
  const dbName = "lifecycle-test";

  beforeEach(async () => {
    if (lifecycle?.db) lifecycle.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it("opens a database and creates all object stores", async () => {
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    const storeNames = [...lifecycle.db!.objectStoreNames];
    expect(storeNames).toEqual(expect.arrayContaining([ROWS_STORE, OPERATIONS_STORE, CLIENT_STATE_STORE]));

    const tx = lifecycle.transaction([CLIENT_STATE_STORE], "readonly");
    const protocol = await new Promise<any>((resolve, reject) => {
      const req = tx.objectStore(CLIENT_STATE_STORE).get("syncProtocolVersion");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(protocol).toBe(4);
  });

  it("refuses initialized old protocol stores non-destructively and closes rejected handles", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(ROWS_STORE, { keyPath: ["table_name", "row_key"] });
        db.createObjectStore(OPERATIONS_STORE, { keyPath: ["op.dot.clientId", "op.dot.version"] });
        const clientState = db.createObjectStore(CLIENT_STATE_STORE);
        clientState.put(3, "syncProtocolVersion");
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName)).rejects.toThrow("Unsupported local sync store protocol");
    expect(lifecycle.db).toBeUndefined();
  });

  it("refuses uninitialized stores that already contain data", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(ROWS_STORE, { keyPath: ["table_name", "row_key"] }).put({
          table_name: "clubs",
          row_key: "driver",
          fields: {},
        });
        db.createObjectStore(OPERATIONS_STORE, { keyPath: ["op.dot.clientId", "op.dot.version"] });
        db.createObjectStore(CLIENT_STATE_STORE);
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName)).rejects.toThrow("Unsupported local sync store protocol");
  });

  it("does not auto-repair databases missing required stores", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CLIENT_STATE_STORE);
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName)).rejects.toThrow("missing required object stores");

    const stores = await new Promise<string[]>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => {
        const names = [...req.result.objectStoreNames];
        req.result.close();
        resolve(names);
      };
      req.onerror = () => reject(req.error);
    });

    expect(stores).toEqual([CLIENT_STATE_STORE]);
  });

  it("aborts explicit upgrades of old stores without changing their version or data", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(ROWS_STORE, { keyPath: ["table_name", "row_key"] }).put({
          table_name: "users", row_key: "kept", fields: {},
        });
        db.createObjectStore(OPERATIONS_STORE, { keyPath: ["op.dot.clientId", "op.dot.version"] });
        const state = db.createObjectStore(CLIENT_STATE_STORE);
        state.put(3, "syncProtocolVersion");
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName, 2)).rejects.toThrow("Unsupported local sync store");
    const version = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => {
        const version = request.result.version;
        request.result.close();
        resolve(version);
      };
      request.onerror = () => reject(request.error);
    });
    expect(version).toBe(1);
  });
});
