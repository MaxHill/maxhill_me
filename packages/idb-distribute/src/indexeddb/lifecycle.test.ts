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
});
