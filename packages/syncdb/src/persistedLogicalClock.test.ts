import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PersistedLogicalClock } from "./persistedLogicalClock.ts";
import { Lifecycle } from "./indexeddb/lifecycle.ts";
import { ClientState } from "./indexeddb/clientState.ts";

describe("PersistedLogicalClock", () => {
  let lifecycle: Lifecycle;
  let clientState: ClientState;
  let logicalClock: PersistedLogicalClock;

  beforeEach(async () => {
    if (lifecycle?.db) {
      lifecycle.close();
    }

    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase("logicalClockTest");
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });

    lifecycle = new Lifecycle();
    await lifecycle.open("logicalClockTest");
    clientState = new ClientState();
    logicalClock = new PersistedLogicalClock(clientState);
  });

  afterEach(() => {
    if (lifecycle?.db) {
      lifecycle.close();
    }
  });

  it("should tick and increment version", async () => {
    let tx = lifecycle.transaction(["clientState"], "readwrite");
    const result1 = await logicalClock.tick(tx);
    expect(result1).toEqual(0);
    await lifecycle.commit(tx);

    tx = lifecycle.transaction(["clientState"], "readwrite");
    const result2 = await logicalClock.tick(tx);
    expect(result2).toBe(1);
    await lifecycle.commit(tx);

    tx = lifecycle.transaction(["clientState"], "readwrite");
    const result3 = await logicalClock.tick(tx);
    expect(result3).toBe(2);
    await lifecycle.commit(tx);
  });

  it("should sync with a greater clock value", async () => {
    const tx = lifecycle.transaction(["clientState"], "readwrite");

    await clientState.setVersion(tx, 5);

    const newValue = await logicalClock.sync(tx, 10); // max(5,10) = 10
    expect(newValue).toBe(10);
    await lifecycle.commit(tx);

    const txRead = lifecycle.transaction(["clientState"], "readonly");
    const stored = await clientState.getVersion(txRead);
    expect(stored).toBe(10);

    await lifecycle.commit(txRead);
  });

  it("should sync with a smaller clock value", async () => {
    const tx = lifecycle.transaction(["clientState"], "readwrite");
    await clientState.setVersion(tx, 10);

    const newValue = await logicalClock.sync(tx, 5); // max(10,5) = 10
    expect(newValue).toBe(10);

    await lifecycle.commit(tx);

    const txRead = lifecycle.transaction(["clientState"], "readonly");
    const stored = await clientState.getVersion(txRead);
    expect(stored).toBe(10);

    await lifecycle.commit(txRead);
  });

  it("should increment by exactly N after N ticks", async () => {
    const tx = lifecycle.transaction(["clientState"], "readwrite");
    await clientState.setVersion(tx, 10);

    for (let i = 0; i < 5; i++) {
      await logicalClock.tick(tx);
    }
    await lifecycle.commit(tx);

    const txRead = lifecycle.transaction(["clientState"], "readonly");
    const final = await clientState.getVersion(txRead);
    expect(final).toBe(15);

    await lifecycle.commit(txRead);
  });

  it("should not change when syncing with self", async () => {
    const tx = lifecycle.transaction(["clientState"], "readwrite");
    await clientState.setVersion(tx, 20);

    const current = await clientState.getVersion(tx);
    const newValue = await logicalClock.sync(tx, current);
    expect(newValue).toBe(current);
    await lifecycle.commit(tx);
  });

  it("should never decrease through any operation", async () => {
    const tx = lifecycle.transaction("clientState", "readwrite");
    await clientState.setVersion(tx, 10);
    let prev = await clientState.getVersion(tx);
    await lifecycle.commit(tx);

    for (let i = 0; i < 10; i++) {
      const tx = lifecycle.transaction(["clientState"], "readwrite");
      if (Math.random() < 0.5) {
        await logicalClock.tick(tx);
      } else {
        await logicalClock.sync(tx, Math.floor(Math.random() * 20));
      }
      await lifecycle.commit(tx);

      const txRead = lifecycle.transaction(["clientState"], "readonly");
      const current = await clientState.getVersion(txRead);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });

  it("should enforce version >= -1 invariant in sync", async () => {
    const tx = lifecycle.transaction("clientState", "readwrite");

    // Syncing with -1 should work (initial value)
    const result1 = await logicalClock.sync(tx, -1);
    expect(result1).toBe(-1);

    // Any other should throw
    await expect(logicalClock.sync(tx, -2)).rejects.toThrow();

    await lifecycle.commit(tx);
  });

  it("should enforce version >= 0 after any tick operation", async () => {
    // Start from -1 (initial state)
    let tx = lifecycle.transaction("clientState", "readwrite");
    const initial = await clientState.getVersion(tx);
    expect(initial).toBe(-1);
    await lifecycle.commit(tx);

    // First tick should bring us to 0
    tx = lifecycle.transaction("clientState", "readwrite");
    const result = await logicalClock.tick(tx);
    expect(result).toBe(0);
    expect(result).toBeGreaterThanOrEqual(0);
    await lifecycle.commit(tx);

    // Subsequent ticks should always be >= 0
    tx = lifecycle.transaction("clientState", "readwrite");
    const result2 = await logicalClock.tick(tx);
    expect(result2).toBeGreaterThanOrEqual(0);
    await lifecycle.commit(tx);
  });
});
