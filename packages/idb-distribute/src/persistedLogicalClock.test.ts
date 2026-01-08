import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { PersistedLogicalClock } from "./persistedLogicalClock";
import { type InternalDbSchema, openAppDb } from "./db";
import type { IDBPDatabase } from "idb";
import { CRDTDatabase } from "./crdtDatabase";
import { promisifyIDBRequest, txDone } from "./utils";
import { IDBRepository } from "./IDBRepository";

describe("PersistedLogicalClock", () => {
  let idbRepository: IDBRepository;
  let logicalClock: PersistedLogicalClock;

  beforeEach(async () => {
    idbRepository = new IDBRepository();
    await idbRepository.open("logicalClockTest");
    logicalClock = new PersistedLogicalClock(idbRepository);

    // Clear and reinitialize to -1 (matching the database schema)
    const clearTx = idbRepository.transaction("clientState", "readwrite");
    const store = clearTx.objectStore("clientState");
    await promisifyIDBRequest(store.clear());
    await promisifyIDBRequest(store.put(-1, "logicalClock"));
    await txDone(clearTx);
  });

  it("should tick and increment version", async () => {
    let tx = idbRepository.transaction(["clientState"], "readwrite");
    const result1 = await logicalClock.tick(tx);
    expect(result1).toEqual(0);
    await txDone(tx);

    tx = idbRepository.transaction(["clientState"], "readwrite");
    const result2 = await logicalClock.tick(tx);
    expect(result2).toBe(1);
    await txDone(tx);

    tx = idbRepository.transaction(["clientState"], "readwrite");
    const result3 = await logicalClock.tick(tx);
    expect(result3).toBe(2);
    await txDone(tx);
  });

  it("should sync with a greater clock value", async () => {
    const tx = idbRepository.transaction(["clientState"], "readwrite");

    await idbRepository.setVersion(tx, 5);

    const newValue = await logicalClock.sync(tx, 10); // max(5,10) = 10
    expect(newValue).toBe(10);
    await txDone(tx);

    const txRead = idbRepository.transaction(["clientState"], "readonly");
    const stored = await idbRepository.getVersion(txRead);
    expect(stored).toBe(10);

    await txDone(txRead);
  });

  it("should sync with a smaller clock value", async () => {
    const tx = idbRepository.transaction(["clientState"], "readwrite");
    await idbRepository.setVersion(tx, 10);

    const newValue = await logicalClock.sync(tx, 5); // max(10,5) = 10
    expect(newValue).toBe(10);

    await txDone(tx);

    const txRead = idbRepository.transaction(["clientState"], "readonly");
    const stored = await idbRepository.getVersion(txRead);
    expect(stored).toBe(10);

    await txDone(txRead);
  });

  it("should increment by exactly N after N ticks", async () => {
    const tx = idbRepository.transaction(["clientState"], "readwrite");
    await idbRepository.setVersion(tx, 10);

    for (let i = 0; i < 5; i++) {
      await logicalClock.tick(tx);
    }
    await txDone(tx);

    const txRead = idbRepository.transaction(["clientState"], "readonly");
    const final = await idbRepository.getVersion(txRead);
    expect(final).toBe(15);

    await txDone(txRead);
  });

  it("should not change when syncing with self", async () => {
    const tx = idbRepository.transaction(["clientState"], "readwrite");
    await idbRepository.setVersion(tx, 20);

    const current = await idbRepository.getVersion(tx);
    const newValue = await logicalClock.sync(tx, current);
    expect(newValue).toBe(current);
    await txDone(tx);
  });

  it("should never decrease through any operation", async () => {
    const tx = idbRepository.transaction("clientState", "readwrite");
    await idbRepository.setVersion(tx, 10);
    let prev = await idbRepository.getVersion(tx);
    await txDone(tx);

    for (let i = 0; i < 10; i++) {
      const tx = idbRepository.transaction(["clientState"], "readwrite");
      if (Math.random() < 0.5) {
        await logicalClock.tick(tx);
      } else {
        await logicalClock.sync(tx, Math.floor(Math.random() * 20));
      }
      await txDone(tx);

      const txRead = idbRepository.transaction(["clientState"], "readonly");
      const current = await idbRepository.getVersion(txRead);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });

  it("should enforce version >= -1 invariant in sync", async () => {
    const tx = idbRepository.transaction("clientState", "readwrite");

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
    let tx = idbRepository.transaction("clientState", "readwrite");
    const initial = await idbRepository.getVersion(tx);
    expect(initial).toBe(-1);
    await txDone(tx);

    // First tick should bring us to 0
    tx = idbRepository.transaction("clientState", "readwrite");
    const result = await logicalClock.tick(tx);
    expect(result).toBe(0);
    expect(result).toBeGreaterThanOrEqual(0);
    await txDone(tx);

    // Subsequent ticks should always be >= 0
    tx = idbRepository.transaction("clientState", "readwrite");
    const result2 = await logicalClock.tick(tx);
    expect(result2).toBeGreaterThanOrEqual(0);
    await txDone(tx);
  });
});
