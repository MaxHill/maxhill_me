import { Lifecycle, ROWS_STORE, OPERATIONS_STORE, CLIENT_STATE_STORE } from "./lifecycle.ts";
import "fake-indexeddb/auto";

describe("Lifecycle", () => {
  let lifecycle: Lifecycle;
  const dbName = "lifecycle-test";

  beforeEach(async () => {
    if (lifecycle?.db) {
      lifecycle.close();
    }
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it("opens a database and creates all object stores", async () => {
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    expect(lifecycle.db).toBeDefined();
    const storeNames = [...lifecycle.db!.objectStoreNames];
    expect(storeNames).toContain(ROWS_STORE);
    expect(storeNames).toContain(OPERATIONS_STORE);
    expect(storeNames).toContain(CLIENT_STATE_STORE);
  });

  it("creates a transaction against the open database", async () => {
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    const tx = lifecycle.transaction([ROWS_STORE], "readonly");
    expect(tx).toBeDefined();
    expect(tx.objectStoreNames).toContain(ROWS_STORE);
  });

  it("commits a transaction successfully", async () => {
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    const tx = lifecycle.transaction([CLIENT_STATE_STORE], "readonly");
    await expect(lifecycle.commit(tx)).resolves.toBeUndefined();
  });

  it("closes the database", async () => {
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    expect(() => lifecycle.close()).not.toThrow();
  });

  it("throws when creating transaction before open", () => {
    lifecycle = new Lifecycle();

    expect(() => lifecycle.transaction([ROWS_STORE], "readonly")).toThrow(
      "Cannot open transaction - database not initialized",
    );
  });

  it("throws when closing before open", () => {
    lifecycle = new Lifecycle();

    expect(() => lifecycle.close()).toThrow("Cannot close database - db is undefined");
  });

  it("creates user-defined indexes during open", async () => {
    lifecycle = new Lifecycle([{ name: "byAge", table: "users", keys: ["age"] }]);
    await lifecycle.open(dbName);

    const tx = lifecycle.transaction([ROWS_STORE], "readonly");
    const store = tx.objectStore(ROWS_STORE);
    expect(store.indexNames.contains("users_byAge")).toBe(true);
  });

  it("upgrades version when indexes change", async () => {
    // Open without indexes first
    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);
    expect(lifecycle.db!.version).toBe(1);
    lifecycle.close();

    // Re-open with indexes — should trigger version upgrade
    lifecycle = new Lifecycle([{ name: "byAge", table: "users", keys: ["age"] }]);
    await lifecycle.open(dbName);
    expect(lifecycle.db!.version).toBe(2);

    const tx = lifecycle.transaction([ROWS_STORE], "readonly");
    const store = tx.objectStore(ROWS_STORE);
    expect(store.indexNames.contains("users_byAge")).toBe(true);
  });

  it("throws for duplicate index names on same table", async () => {
    lifecycle = new Lifecycle([
      { name: "byAge", table: "users", keys: ["age"] },
      { name: "byAge", table: "users", keys: ["name"] },
    ]);

    await expect(lifecycle.open(dbName)).rejects.toThrow(
      "Index names must be unique per table",
    );
  });

  it("repairs missing required stores by forcing a version upgrade", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("rows")) {
          db.createObjectStore("rows", { keyPath: ["table", "id"] });
        }
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    const storeNames = [...lifecycle.db!.objectStoreNames];
    expect(storeNames).toContain(ROWS_STORE);
    expect(storeNames).toContain(OPERATIONS_STORE);
    expect(storeNames).toContain(CLIENT_STATE_STORE);
    expect(lifecycle.db!.version).toBe(2);
  });

  it("migrates old sync protocol records during open", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(ROWS_STORE, { keyPath: ["table_name", "row_key"] });
        db.createObjectStore(OPERATIONS_STORE, {
          keyPath: ["op.dot.clientId", "op.dot.version"],
        });
        db.createObjectStore(CLIENT_STATE_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction([ROWS_STORE, OPERATIONS_STORE], "readwrite");
        tx.objectStore(ROWS_STORE).put({
          table_name: "clubs",
          row_key: "driver",
          fields: {},
          tombstone: {
            dot: { clientId: "client-1", version: 2 },
            context: { "client-1": 1 },
          },
        });
        tx.objectStore(OPERATIONS_STORE).put({
          op: {
            type: "remove",
            table: "clubs",
            rowKey: "driver",
            dot: { clientId: "client-1", version: 2 },
            context: { "client-1": 1 },
          },
          synced: 0,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    const tx = lifecycle.transaction([ROWS_STORE, OPERATIONS_STORE, CLIENT_STATE_STORE], "readonly");
    const row = await new Promise<any>((resolve, reject) => {
      const req = tx.objectStore(ROWS_STORE).get(["clubs", "driver"]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const operationRecord = await new Promise<any>((resolve, reject) => {
      const req = tx.objectStore(OPERATIONS_STORE).get(["client-1", 2]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const protocolVersion = await new Promise<any>((resolve, reject) => {
      const req = tx.objectStore(CLIENT_STATE_STORE).get("syncProtocolVersion");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(row.tombstone).toEqual({
      dot: { clientId: "client-1", version: 2 },
      versionVector: { "client-1": 1 },
    });
    expect(operationRecord.op).toEqual({
      type: "removeRow",
      tableName: "clubs",
      rowKey: "driver",
      dot: { clientId: "client-1", version: 2 },
      versionVector: { "client-1": 1 },
    });
    expect(protocolVersion).toBe(3);
  });

  it("migrates protocol-v2 set operations to protocol-v3 setRow operations", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(ROWS_STORE, { keyPath: ["table_name", "row_key"] });
        db.createObjectStore(OPERATIONS_STORE, {
          keyPath: ["op.dot.clientId", "op.dot.version"],
        });
        db.createObjectStore(CLIENT_STATE_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction([OPERATIONS_STORE, CLIENT_STATE_STORE], "readwrite");
        tx.objectStore(CLIENT_STATE_STORE).put(2, "syncProtocolVersion");
        tx.objectStore(OPERATIONS_STORE).put({
          op: {
            type: "set",
            tableName: "clubs",
            rowKey: "driver",
            fieldKey: "loft",
            jsonValue: 9.5,
            dot: { clientId: "client-1", version: 3 },
          },
          synced: 1,
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    lifecycle = new Lifecycle();
    await lifecycle.open(dbName);

    const tx = lifecycle.transaction([OPERATIONS_STORE, CLIENT_STATE_STORE], "readonly");
    const operationRecord = await new Promise<any>((resolve, reject) => {
      const req = tx.objectStore(OPERATIONS_STORE).get(["client-1", 3]);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const protocolVersion = await new Promise<any>((resolve, reject) => {
      const req = tx.objectStore(CLIENT_STATE_STORE).get("syncProtocolVersion");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(operationRecord).toEqual({
      op: {
        type: "setRow",
        tableName: "clubs",
        rowKey: "driver",
        fields: { loft: 9.5 },
        dot: { clientId: "client-1", version: 3 },
      },
      synced: 1,
    });
    expect(protocolVersion).toBe(3);
  });
});
