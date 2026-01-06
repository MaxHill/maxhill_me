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

    await promisifyIDBRequest(
      db.transaction("clientState", "readwrite").objectStore("clientState").clear(),
    );
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

  it("should handle negative clock values", async () => {
    const tx = db.transaction("clientState", "readwrite");
    await logicalClock.putVersion(tx, -5);

    const result = await logicalClock.sync(tx, -10);
    expect(result).toBe(-5); // max(-5, -10)
    const current = await logicalClock.getVersion(tx);
    expect(current).toBe(-5);

    await txDone(tx);
  });
});
