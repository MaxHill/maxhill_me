import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import * as logicalClock from "./persistedLogicalClock";
import { openAppDb, type InternalDbSchema } from "./db";
import type { IDBPDatabase } from "idb";

describe("PersistedLogicalClock", () => {
    let db: IDBPDatabase<InternalDbSchema>

	beforeEach(async () => {
        db = await openAppDb("logicalClockTest", 1);
        await db.transaction('_logicalClock', 'readwrite').objectStore('_logicalClock').clear();
	});

	it("should initialize with -1 version", async () => {
        const tx = db.transaction(["_logicalClock"], "readonly")
		const version = await logicalClock.getVersion(tx);
        await tx.done
		expect(version).toEqual(-1);
	});

	it("should tick and increment version", async () => {
        const tx = db.transaction(["_logicalClock"], "readwrite")
		const result1 = await logicalClock.tick(tx);
		expect(result1).toEqual(0);
		const result2 = await logicalClock.tick(tx);
		expect(result2).toBe(1);
		const result3 = await logicalClock.tick(tx);
		expect(result3).toBe(2);
        await tx.done
	});

	it("should sync with a greater clock value", async () => {
        const tx = db.transaction(["_logicalClock"], "readwrite")
		await logicalClock.putVersion(tx, 5);

		const newValue = await logicalClock.sync(tx, 10); // max(5,10)+1 = 11
		expect(newValue).toBe(11);
		const stored = await logicalClock.getVersion(tx);
		expect(stored).toBe(11);
        await tx.done
	});

	it("should sync with a smaller clock value", async () => {
        const tx = db.transaction(["_logicalClock"], "readwrite")
		await logicalClock.putVersion(tx, 10);

		const newValue = await logicalClock.sync(tx,5); // max(10,5)+1 = 11
		expect(newValue).toBe(11);
		const stored = await logicalClock.getVersion(tx);
		expect(stored).toBe(11);
        await tx.done
	});

	it("should increment by exactly N after N ticks", async () => {
        const tx = db.transaction(["_logicalClock"], "readwrite")
		await logicalClock.putVersion(tx,10);

		for (let i = 0; i < 5; i++) {
			await logicalClock.tick(tx);
		}

		const final = await logicalClock.getVersion(tx)
		expect(final).toBe(15);
        await tx.done
	});

	it("should not change when syncing with self (except +1)", async () => {
        const tx = db.transaction(["_logicalClock"], "readwrite")
		await logicalClock.putVersion(tx, 20);


		const current = await logicalClock.getVersion(tx);
		const newValue = await logicalClock.sync(tx,current);
		expect(newValue).toBe(current + 1);
        await tx.done
	});

	it("should never decrease through any operation", async () => {
        const tx = db.transaction("_logicalClock", "readwrite")
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

        await tx.done
	});

	it("should handle negative clock values", async () => {
        const tx = db.transaction("_logicalClock", "readwrite")
		await logicalClock.putVersion(tx, -5)

		const result = await logicalClock.sync(tx, -10);
		expect(result).toBe(-4); // max(-5, -10) + 1
		const current = await logicalClock.getVersion(tx);
		expect(current).toBe(-4);
        
        await tx.done
	});

});
