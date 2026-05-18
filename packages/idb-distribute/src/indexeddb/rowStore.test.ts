import { RowStore } from "./rowStore.ts";
import { Lifecycle, ROWS_STORE } from "./lifecycle.ts";
import { ORMapRow, ROW_KEY, TABLE_NAME } from "../crdt.ts";
import { below } from "../indexes.ts";
import "fake-indexeddb/auto";

describe("RowStore", () => {
  let lifecycle: Lifecycle;
  let rowStore: RowStore;
  const dbName = "rowstore-test";

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
    rowStore = new RowStore();
  });

  it("saves a row and retrieves it", async () => {
    const row: ORMapRow = {
      [TABLE_NAME]: "users",
      [ROW_KEY]: "user1",
      fields: {
        name: { value: "Alice", dot: { clientId: "c1", version: 1 } },
      },
    };

    const saveTx = lifecycle.transaction(ROWS_STORE, "readwrite");
    await rowStore.saveRow(saveTx, row);
    await lifecycle.commit(saveTx);

    const getTx = lifecycle.transaction(ROWS_STORE, "readonly");
    const result = await rowStore.getRow(getTx, "users", "user1");
    await lifecycle.commit(getTx);

    expect(result).toEqual(row);
  });

  it("returns empty row for non-existent key", async () => {
    const tx = lifecycle.transaction(ROWS_STORE, "readonly");
    const result = await rowStore.getRow(tx, "users", "nonexistent");
    await lifecycle.commit(tx);

    expect(result).toEqual({ [TABLE_NAME]: "users", [ROW_KEY]: "nonexistent", fields: {} });
  });

  it("deletes row when saved with empty fields and no tombstone", async () => {
    const row: ORMapRow = {
      [TABLE_NAME]: "users",
      [ROW_KEY]: "user1",
      fields: {
        name: { value: "Alice", dot: { clientId: "c1", version: 1 } },
      },
    };

    const saveTx = lifecycle.transaction(ROWS_STORE, "readwrite");
    await rowStore.saveRow(saveTx, row);
    await lifecycle.commit(saveTx);

    const emptyRow: ORMapRow = { [TABLE_NAME]: "users", [ROW_KEY]: "user1", fields: {} };
    const deleteTx = lifecycle.transaction(ROWS_STORE, "readwrite");
    await rowStore.saveRow(deleteTx, emptyRow);
    await lifecycle.commit(deleteTx);

    const getTx = lifecycle.transaction(ROWS_STORE, "readonly");
    const result = await rowStore.getRow(getTx, "users", "user1");
    await lifecycle.commit(getTx);

    expect(result).toEqual({ [TABLE_NAME]: "users", [ROW_KEY]: "user1", fields: {} });
  });

  it("queries rows using an index", async () => {
    const indexes = [{ name: "byAge", table: "users", keys: ["age"] }];

    // Re-open with indexes
    lifecycle.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    lifecycle = new Lifecycle(indexes);
    await lifecycle.open(dbName);
    rowStore = new RowStore(indexes);

    const saveTx = lifecycle.transaction(ROWS_STORE, "readwrite");
    await rowStore.saveRow(saveTx, {
      [TABLE_NAME]: "users",
      [ROW_KEY]: "u1",
      fields: { age: { value: 20, dot: { clientId: "c1", version: 1 } } },
    });
    await rowStore.saveRow(saveTx, {
      [TABLE_NAME]: "users",
      [ROW_KEY]: "u2",
      fields: { age: { value: 30, dot: { clientId: "c1", version: 2 } } },
    });
    await rowStore.saveRow(saveTx, {
      [TABLE_NAME]: "users",
      [ROW_KEY]: "u3",
      fields: { age: { value: 25, dot: { clientId: "c1", version: 3 } } },
    });
    await lifecycle.commit(saveTx);

    const queryTx = lifecycle.transaction(ROWS_STORE, "readonly");
    const results: ORMapRow[] = [];
    for await (const row of rowStore.query(queryTx, "users", below(26, { inclusive: true }), "byAge")) {
      results.push(row);
    }

    expect(results).toHaveLength(2);
    expect(results[0].fields.age.value).toBe(20);
    expect(results[1].fields.age.value).toBe(25);
  });
});
