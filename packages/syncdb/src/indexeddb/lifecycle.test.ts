import { CLIENT_STATE_STORE, Lifecycle, OPERATIONS_STORE, ROWS_STORE } from "./lifecycle.ts";
import "fake-indexeddb/auto";

// Suite registration groups related tests; individual tests remain line-limited.
// eslint-disable-next-line max-lines-per-function
describe("Lifecycle", () => {
  let lifecycle: Lifecycle;
  const dbName = "lifecycle-test";

  beforeEach(async () => {
    if (lifecycle?.db) {
      lifecycle.close();
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

  it("opens a database and creates all object stores", async () => {
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    const storeNames = [...lifecycle.db!.objectStoreNames];
    expect(storeNames).toEqual(
      expect.arrayContaining([ROWS_STORE, OPERATIONS_STORE, CLIENT_STATE_STORE]),
    );

    const tx = lifecycle.transaction([CLIENT_STATE_STORE], "readonly");
    const protocol = await new Promise<any>((resolve, reject) => {
      const request = tx.objectStore(CLIENT_STATE_STORE).get("syncProtocolVersion");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(protocol).toBe(4);
  });

  it("refuses old protocol stores without data loss and closes rejected handles", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(ROWS_STORE, { keyPath: ["table_name", "row_key"] });
        db.createObjectStore(OPERATIONS_STORE, {
          keyPath: ["operation.dot.clientId", "operation.dot.version"],
        });
        const clientState = db.createObjectStore(CLIENT_STATE_STORE);
        clientState.put(3, "syncProtocolVersion");
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName)).rejects.toThrow("Unsupported local sync store protocol");
    expect(lifecycle.db).toBeUndefined();
  });

  it.each([false, true])("refuses uninitialized stores (populated: %s)", async (populated) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const rows = db.createObjectStore(ROWS_STORE, {
          keyPath: ["table_name", "row_key"],
        });
        if (populated) {
          rows.put({ table_name: "clubs", row_key: "driver", fields: {} });
        }
        db.createObjectStore(OPERATIONS_STORE, {
          keyPath: ["operation.dot.clientId", "operation.dot.version"],
        });
        db.createObjectStore(CLIENT_STATE_STORE);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName)).rejects.toThrow("Unsupported local sync store protocol");
  });

  it("does not auto-repair databases missing required stores", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(CLIENT_STATE_STORE);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName)).rejects.toThrow("missing required object stores");

    const stores = await new Promise<string[]>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => {
        const names = [...request.result.objectStoreNames];
        request.result.close();
        resolve(names);
      };
      request.onerror = () => reject(request.error);
    });

    expect(stores).toEqual([CLIENT_STATE_STORE]);
  });

  it("aborts explicit upgrades of old stores without changing their version or data", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(ROWS_STORE, { keyPath: ["table_name", "row_key"] }).put({
          table_name: "users",
          row_key: "kept",
          fields: {},
        });
        db.createObjectStore(OPERATIONS_STORE, {
          keyPath: ["operation.dot.clientId", "operation.dot.version"],
        });
        const state = db.createObjectStore(CLIENT_STATE_STORE);
        state.put(3, "syncProtocolVersion");
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    lifecycle = new Lifecycle();
    await expect(lifecycle.open(dbName, 2)).rejects.toThrow("Unsupported local sync store");
    const version = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => {
        const storedVersion = request.result.version;
        request.result.close();
        resolve(storedVersion);
      };
      request.onerror = () => reject(request.error);
    });
    expect(version).toBe(1);
  });
});
