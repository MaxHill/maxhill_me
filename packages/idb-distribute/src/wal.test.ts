import "fake-indexeddb/auto";
import { WAL } from "./wal";
import { describe, it, expect, beforeEach } from "vitest";
import { openAppDb, type InternalDbSchema } from "./db";
import { deleteDB, type IDBPDatabase, type IDBPTransaction } from "idb";

describe("Wal", () => {
    let db: IDBPDatabase<InternalDbSchema & { users: { key: string; value: { id: string; name: string } } }>;
    let wal: WAL;

    beforeEach(async () => {
        const dbName = `walTest-${Math.random().toString(36).slice(2)}`;
        await deleteDB(dbName)
        db = await openAppDb<InternalDbSchema & { users: { key: string; value: { id: string; name: string } } }>(dbName, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains("users")) {
                    db.createObjectStore("users", { keyPath: "id" });
                }
            }
        });
        wal = new WAL();
    });

    it("applies WAL entries to another DB and updates lastAppliedVersion", async () => {
        const tx = db.transaction(["_wal", "_logicalClock", "_clientId", "_lastAppliedVersion", "users"], "readwrite");
        await wal.writeNewOperation((tx as unknown as IDBPTransaction<InternalDbSchema, any, "readwrite">), {
            operation: "put",
            table: "users",
            value: { id: "1", name: "Bob" },
        });

        await wal.applyPendingOperations(tx);
        await tx.done;

        const user = await db.get("users", "1");
        expect(user?.name).toBe("Bob");

        const lastAppliedVersion = await db.get("_lastAppliedVersion", "value");
        expect(lastAppliedVersion).toBe(0);

        db.close();
    });

    it("applies clear WAL entries and clears all data from table", async () => {
        const tx = db.transaction(["_wal", "_logicalClock", "_clientId", "_lastAppliedVersion", "users"], "readwrite");

        // Put some data
        await wal.writeNewOperation((tx as unknown as IDBPTransaction<InternalDbSchema, any, "readwrite">), {
            operation: "put",
            table: "users",
            value: { id: "1", name: "Bob" },
        });
        await wal.writeNewOperation((tx as unknown as IDBPTransaction<InternalDbSchema, any, "readwrite">), {
            operation: "put",
            table: "users",
            value: { id: "2", name: "Alice" },
        });

        // Clear the table
        await wal.writeNewOperation((tx as unknown as IDBPTransaction<InternalDbSchema, any, "readwrite">), {
            operation: "clear",
            table: "users",
            value: null,
        });

        await wal.applyPendingOperations(tx);
        await tx.done;

        // Verify data is cleared
        const user1 = await db.get("users", "1");
        const user2 = await db.get("users", "2");
        expect(user1).toBeUndefined();
        expect(user2).toBeUndefined();

        const lastAppliedVersion = await db.get("_lastAppliedVersion", "value");
        expect(lastAppliedVersion).toBe(2);

        db.close();
    });
});








