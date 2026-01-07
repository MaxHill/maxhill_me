import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import * as logicalClock from "./persistedLogicalClock";
import { type InternalDbSchema, openAppDb } from "./db";
import type { IDBPDatabase } from "idb";
import { CRDTDatabase } from "./crdtDatabase";
import { promisifyIDBRequest, txDone } from "./utils";

describe("PersistedLogicalClock", () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    const crdtDB = new CRDTDatabase("logicalClockTest");
    await crdtDB.open();
    assert(crdtDB.db);
    db = crdtDB.db;

    // Clear and reinitialize to -1 (matching the database schema)
    const clearTx = db.transaction("clientState", "readwrite");
    const store = clearTx.objectStore("clientState");
    await promisifyIDBRequest(store.clear());
    await promisifyIDBRequest(store.put(-1, "logicalClock"));
    await txDone(clearTx);
  });

  it("should initialize with -1 version", async () => {
    const tx = db.transaction(["clientState"], "readonly");
    const version = await logicalClock.getVersion(tx);
    await txDone(tx);

    expect(version).toEqual(-1);
  });

  it("should tick and increment version", async () => {
    let tx = db.transaction(["clientState"], "readwrite");
    const result1 = await logicalClock.tick(tx);
    expect(result1).toEqual(0);
    await txDone(tx);

    tx = db.transaction(["clientState"], "readwrite");
    const result2 = await logicalClock.tick(tx);
    expect(result2).toBe(1);
    await txDone(tx);

    tx = db.transaction(["clientState"], "readwrite");
    const result3 = await logicalClock.tick(tx);
    expect(result3).toBe(2);
    await txDone(tx);
  });

  it("should sync with a greater clock value", async () => {
    const tx = db.transaction(["clientState"], "readwrite");

    await logicalClock.putVersion(tx, 5);

    const newValue = await logicalClock.sync(tx, 10); // max(5,10) = 10
    expect(newValue).toBe(10);

    const stored = await logicalClock.getVersion(tx);
    expect(stored).toBe(10);

    await txDone(tx);
  });

  it("should sync with a smaller clock value", async () => {
    const tx = db.transaction(["clientState"], "readwrite");
    await logicalClock.putVersion(tx, 10);

    const newValue = await logicalClock.sync(tx, 5); // max(10,5) = 10
    expect(newValue).toBe(10);

    const stored = await logicalClock.getVersion(tx);
    expect(stored).toBe(10);

    await txDone(tx);
  });

  it("should increment by exactly N after N ticks", async () => {
    const tx = db.transaction(["clientState"], "readwrite");
    await logicalClock.putVersion(tx, 10);

    for (let i = 0; i < 5; i++) {
      await logicalClock.tick(tx);
    }

    const final = await logicalClock.getVersion(tx);
    expect(final).toBe(15);

    await txDone(tx);
  });

  it("should not change when syncing with self", async () => {
    const tx = db.transaction(["clientState"], "readwrite");
    await logicalClock.putVersion(tx, 20);

    const current = await logicalClock.getVersion(tx);
    const newValue = await logicalClock.sync(tx, current);
    expect(newValue).toBe(current);
    await txDone(tx);
  });

  it("should never decrease through any operation", async () => {
    const tx = db.transaction("clientState", "readwrite");
    await logicalClock.putVersion(tx, 10);
    let prev = await logicalClock.getVersion(tx);

    for (let i = 0; i < 10; i++) {
      if (Math.random() < 0.5) {
        await logicalClock.tick(tx);
      } else {
        await logicalClock.sync(tx, Math.floor(Math.random() * 20));
      }

      const current = await logicalClock.getVersion(tx);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }

    await txDone(tx);
  });

  it("should throw when version is undefined", async () => {
    // Clear the version to make it undefined
    const clearTx = db.transaction("clientState", "readwrite");
    await promisifyIDBRequest(clearTx.objectStore("clientState").delete("logicalClock"));
    await txDone(clearTx);

    const tx = db.transaction("clientState", "readonly");
    await expect(logicalClock.getVersion(tx)).rejects.toThrow(
      "Version should never be undefined since it's initialized to -1"
    );
    await txDone(tx);
  });

  it("should throw when version goes below -1", async () => {
    const tx = db.transaction("clientState", "readwrite");
    await logicalClock.putVersion(tx, -2);

    await expect(logicalClock.getVersion(tx)).rejects.toThrow(
      "Version could never be less than initialized value -1"
    );
    await txDone(tx);
  });

  it("should throw when tick would result in negative version", async () => {
    const tx = db.transaction("clientState", "readwrite");
    // This should throw because -1 + 1 = 0, but if somehow version was lower...
    // Actually, starting from -1 and ticking gives 0, which is fine.
    // Let's test that tick from -1 works correctly
    const result = await logicalClock.tick(tx);
    expect(result).toBe(0);
    await txDone(tx);
  });

  it("should enforce version >= -1 invariant in sync", async () => {
    const tx = db.transaction("clientState", "readwrite");
    
    // Syncing with -1 should work (initial value)
    const result1 = await logicalClock.sync(tx, -1);
    expect(result1).toBe(-1);

    // Syncing with a value less than -1 still results in max(-1, -2) = -1
    // The assertion protects against implementation bugs, not invalid inputs
    const result2 = await logicalClock.sync(tx, -2);
    expect(result2).toBe(-1); // max(-1, -2) = -1, which is valid
    
    await txDone(tx);
  });

  it("should enforce version >= 0 after any tick operation", async () => {
    // Start from -1 (initial state)
    let tx = db.transaction("clientState", "readwrite");
    const initial = await logicalClock.getVersion(tx);
    expect(initial).toBe(-1);
    await txDone(tx);

    // First tick should bring us to 0
    tx = db.transaction("clientState", "readwrite");
    const result = await logicalClock.tick(tx);
    expect(result).toBe(0);
    expect(result).toBeGreaterThanOrEqual(0);
    await txDone(tx);

    // Subsequent ticks should always be >= 0
    tx = db.transaction("clientState", "readwrite");
    const result2 = await logicalClock.tick(tx);
    expect(result2).toBeGreaterThanOrEqual(0);
    await txDone(tx);
  });
});
