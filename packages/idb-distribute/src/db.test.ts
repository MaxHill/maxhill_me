import "fake-indexeddb/auto";
import { type DBSchema, type IDBPTransaction } from "idb";
import { describe, expect, it } from "vitest";
import { openAppDb, type InternalDbSchema } from "./db";
import { WAL } from "./wal";

describe("openAppDb", () => {
    it("prevents creating objectStores with autoIncrement", async () => {
        const dbName = `test-autoincrement-${Math.random().toString(36).slice(2)}`;

        let error: any = null;
        const db = await openAppDb(dbName, 1, {
            upgrade(db) {
                try {
                    db.createObjectStore('testStore', { autoIncrement: true });
                } catch (e) {
                    error = e as Error;
                }
            }
        });

        expect(error.message).toContain("Autoincrementing IDs are not supported");
        expect((db.objectStoreNames as any).contains('testStore')).toBe(false);
        db.close();
    });

    it("allows creating objectStores without autoIncrement", async () => {
        const dbName = `test-normal-${Math.random().toString(36).slice(2)}`;

        const db = await openAppDb<TestSchema>(dbName, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('testStore')) {
                    db.createObjectStore('testStore', { keyPath: 'id' });
                }
            }
        });

        expect(db.objectStoreNames.contains('testStore')).toBe(true);
        expect(db.objectStoreNames.contains('_lastAppliedVersion')).toBe(true);
        expect(db.objectStoreNames.contains('_lastSyncedVersion')).toBe(true);
        expect(db.objectStoreNames.contains('_logicalClock')).toBe(true);
        expect(db.objectStoreNames.contains('_clientId')).toBe(true);
        expect(db.objectStoreNames.contains('_wal')).toBe(true);

        db.close();
    });

    it("creates internal stores correctly", async () => {
        const dbName = `test-internal-${Math.random().toString(36).slice(2)}`;

        const db = await openAppDb(dbName, 1, {});

        expect(db.objectStoreNames.contains('_lastAppliedVersion')).toBe(true);
        expect(db.objectStoreNames.contains('_lastSyncedVersion')).toBe(true);
        expect(db.objectStoreNames.contains('_logicalClock')).toBe(true);
        expect(db.objectStoreNames.contains('_clientId')).toBe(true);
        expect(db.objectStoreNames.contains('_wal')).toBe(true);

        // Check that internal stores have correct initial values
        const tx = db.transaction(['_lastAppliedVersion', '_lastSyncedVersion', '_logicalClock'], 'readonly');
        expect(await tx.objectStore('_lastAppliedVersion').get('value')).toBe(-1);
        expect(await tx.objectStore('_lastSyncedVersion').get('value')).toBe(-1);
        expect(await tx.objectStore('_logicalClock').get('value')).toBe(-1);
        await tx.done;

        db.close();
    });

    it("calls user upgrade callback", async () => {
        const dbName = `test-upgrade-${Math.random().toString(36).slice(2)}`;
        let upgradeCalled = false;

        const db = await openAppDb<TestSchema>(dbName, 1, {
            upgrade(db, oldVersion, newVersion) {
                upgradeCalled = true;
                expect(oldVersion).toBe(0);
                expect(newVersion).toBe(1);
                if (!db.objectStoreNames.contains('userStore')) {
                    db.createObjectStore('userStore');
                }
            }
        });

        expect(upgradeCalled).toBe(true);
        expect(db.objectStoreNames.contains('userStore')).toBe(true);

        db.close();
    });

    it("supports clear operations end-to-end with WAL", async () => {
        const dbName = `test-clear-${Math.random().toString(36).slice(2)}`;
        const db = await openAppDb<TestSchema>(dbName, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('testStore')) {
                    db.createObjectStore('testStore', { keyPath: 'id' });
                }
            }
        });

        const wal = new WAL();

        // Add some data
        const tx1 = db.transaction(['testStore', '_wal', '_logicalClock', '_clientId', '_lastAppliedVersion'], 'readwrite');
        await wal.writeNewEntry(tx1 as unknown as IDBPTransaction<InternalDbSchema, ["_wal", "_logicalClock", "_clientId", ...any[]], "readwrite">, {
            operation: 'put',
            table: 'testStore',
            value: { id: '1', data: 'first' },
        });
        await wal.writeNewEntry(tx1 as unknown as IDBPTransaction<InternalDbSchema, ["_wal", "_logicalClock", "_clientId", ...any[]], "readwrite">, {
            operation: 'put',
            table: 'testStore',
            value: { id: '2', data: 'second' },
        });
        await wal.applyPendingEntries(tx1);
        await tx1.done;

        // Verify data exists
        expect(await db.count('testStore')).toBe(2);
        expect(await db.get('testStore', '1')).toEqual({ id: '1', data: 'first' });
        expect(await db.get('testStore', '2')).toEqual({ id: '2', data: 'second' });

        // Clear the table
        const tx2 = db.transaction(['testStore', '_wal', '_logicalClock', '_clientId', '_lastAppliedVersion'], 'readwrite');
        await wal.writeNewEntry(tx2 as unknown as IDBPTransaction<InternalDbSchema, ["_wal", "_logicalClock", "_clientId", ...any[]], "readwrite">, {
            operation: 'clear',
            table: 'testStore',
            value: null,
        });
        await wal.applyPendingEntries(tx2);
        await tx2.done;

        // Verify data is cleared
        expect(await db.count('testStore')).toBe(0);
        expect(await db.get('testStore', '1')).toBeUndefined();
        expect(await db.get('testStore', '2')).toBeUndefined();

        db.close();
    });
});

interface TestSchema extends DBSchema {
    testStore: {
        key: string;
        value: { id: string; data: string };
    };
    userStore: {
        key: string;
        value: any;
    };
}
