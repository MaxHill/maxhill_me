import { IDBRepository } from "./IDBRepository.ts";
import { promisifyIDBRequest, txDone } from "./utils.ts";
import { CRDTOperation, ORMapRow, ROW_KEY, TABLE_NAME } from "./crdt.ts";
import { below } from "./indexes.ts";
import "fake-indexeddb/auto";

describe("IDBRepository", () => {
  let idbRepository: IDBRepository;

  beforeEach(async () => {
    // Close existing database if open
    if (idbRepository?.db) {
      idbRepository.close();
    }

    // Delete the database to start fresh
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase("logicalClockTest");
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });

    // Create new instance and open
    idbRepository = new IDBRepository();
    await idbRepository.open("logicalClockTest");
  });

  it("should initialize with -1 version", async () => {
    const tx = idbRepository.transaction(["clientState"], "readonly");
    const version = await idbRepository.getVersion(tx);
    await txDone(tx);

    expect(version).toEqual(-1);
  });

  it("should throw when version is undefined", async () => {
    // Clear the version to make it undefined
    const clearTx = idbRepository.transaction("clientState", "readwrite");
    await promisifyIDBRequest(clearTx.objectStore("clientState").delete("logicalClock"));
    await txDone(clearTx);

    const tx = idbRepository.transaction("clientState", "readonly");
    await expect(idbRepository.getVersion(tx)).rejects.toThrow(
      "Version should never be undefined since it's initialized to -1",
    );
    await txDone(tx);
  });

  it("should throw when version goes below -1", async () => {
    const tx = idbRepository.transaction("clientState", "readwrite");
    await idbRepository.setVersion(tx, -2);

    await expect(idbRepository.getVersion(tx)).rejects.toThrow(
      "Version could never be less than initialized value -1",
    );
    await txDone(tx);
  });

  describe("Database lifecycle", () => {
    it("should close database successfully", async () => {
      expect(idbRepository.db).toBeDefined();
      idbRepository.close();
      // After closing, db should still be defined but in closed state
      expect(idbRepository.db).toBeDefined();
    });
  });

  describe("Row operations", () => {
    it("should save and retrieve a row with fields", async () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "users",
        [ROW_KEY]: "user1",
        fields: {
          name: { value: "John", dot: { clientId: "client1", version: 1 } },
          age: { value: 30, dot: { clientId: "client1", version: 2 } },
        },
      };

      const saveTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(saveTx, row);
      await txDone(saveTx);

      const getTx = idbRepository.transaction("rows", "readonly");
      const retrieved = await idbRepository.getRow(getTx, "users", "user1");
      await txDone(getTx);

      expect(retrieved).toEqual(row);
      expect(retrieved.fields.name.value).toBe("John");
      expect(retrieved.fields.age.value).toBe(30);
    });

    it("should save and retrieve a row with tombstone", async () => {
      const row: ORMapRow = {
        [TABLE_NAME]: "users",
        [ROW_KEY]: "user2",
        fields: {
          name: { value: "Jane", dot: { clientId: "client1", version: 1 } },
        },
        tombstone: {
          dot: { clientId: "client1", version: 3 },
          context: { client1: 2 },
        },
      };

      const saveTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(saveTx, row);
      await txDone(saveTx);

      const getTx = idbRepository.transaction("rows", "readonly");
      const retrieved = await idbRepository.getRow(getTx, "users", "user2");
      await txDone(getTx);

      expect(retrieved.tombstone).toBeDefined();
      expect(retrieved.tombstone?.dot.version).toBe(3);
      expect(retrieved.tombstone?.context).toEqual({ client1: 2 });
    });

    it("should return empty row for non-existent key", async () => {
      const tx = idbRepository.transaction("rows", "readonly");
      const retrieved = await idbRepository.getRow(tx, "users", "nonexistent");
      await txDone(tx);

      expect(retrieved).toEqual({ [TABLE_NAME]: "users", [ROW_KEY]: "nonexistent", fields: {} });
    });

    it("should delete row when fields are empty and no tombstone", async () => {
      // First save a row
      const row: ORMapRow = {
        [TABLE_NAME]: "users",
        [ROW_KEY]: "user3",
        fields: {
          name: { value: "Bob", dot: { clientId: "client1", version: 1 } },
        },
      };

      const saveTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(saveTx, row);
      await txDone(saveTx);

      // Now save an empty row (should delete it)
      const emptyRow: ORMapRow = { [TABLE_NAME]: "users", [ROW_KEY]: "user3", fields: {} };
      const deleteTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(deleteTx, emptyRow);
      await txDone(deleteTx);

      // Try to retrieve it
      const getTx = idbRepository.transaction("rows", "readonly");
      const retrieved = await idbRepository.getRow(getTx, "users", "user3");
      await txDone(getTx);

      expect(retrieved).toEqual({ [TABLE_NAME]: "users", [ROW_KEY]: "user3", fields: {} });
    });
  });

  describe("Operation logging", () => {
    it("should log and retrieve a set operation", async () => {
      const op: CRDTOperation = {
        type: "set",
        table: "users",
        rowKey: "user1",
        field: "name",
        value: "Alice",
        dot: { clientId: "client1", version: 1 },
      };

      const logTx = idbRepository.transaction("operations", "readwrite");
      await idbRepository.saveOperation(logTx, op);
      await txDone(logTx);

      const getTx = idbRepository.transaction("operations", "readonly");
      const operations = await idbRepository.getUnsyncedOperations(getTx);
      await txDone(getTx);

      expect(operations).toHaveLength(1);
      expect(operations[0]).toEqual(op);
    });

    it("should log and retrieve a setRow operation", async () => {
      const op: CRDTOperation = {
        type: "setRow",
        table: "users",
        rowKey: "user2",
        value: { name: "Bob", age: 25 },
        dot: { clientId: "client1", version: 2 },
      };

      const logTx = idbRepository.transaction("operations", "readwrite");
      await idbRepository.saveOperation(logTx, op);
      await txDone(logTx);

      const getTx = idbRepository.transaction("operations", "readonly");
      const operations = await idbRepository.getUnsyncedOperations(getTx);
      await txDone(getTx);

      expect(operations).toHaveLength(1);
      expect(operations[0]).toEqual(op);
    });

    it("should log and retrieve a remove operation", async () => {
      const op: CRDTOperation = {
        type: "remove",
        table: "users",
        rowKey: "user3",
        dot: { clientId: "client1", version: 3 },
        context: { client1: 2 },
      };

      const logTx = idbRepository.transaction("operations", "readwrite");
      await idbRepository.saveOperation(logTx, op);
      await txDone(logTx);

      const getTx = idbRepository.transaction("operations", "readonly");
      const operations = await idbRepository.getUnsyncedOperations(getTx);
      await txDone(getTx);

      expect(operations).toHaveLength(1);
      expect(operations[0]).toEqual(op);
    });

    it("should return empty array when no unsynced operations exist", async () => {
      const tx = idbRepository.transaction("operations", "readonly");
      const operations = await idbRepository.getUnsyncedOperations(tx);
      await txDone(tx);

      expect(operations).toEqual([]);
    });
  });

  describe("Client state management", () => {
    it("should initialize client state with undefined clientId", async () => {
      const tx = idbRepository.transaction("clientState", "readonly");
      const clientState = await idbRepository.getClientState(tx);
      await txDone(tx);

      expect(clientState.clientId).toBeUndefined();
      expect(clientState.lastSeenServerVersion).toBe(-1);
    });

    it("should save and retrieve client ID", async () => {
      const clientId = "test-client-123";

      const saveTx = idbRepository.transaction("clientState", "readwrite");
      await idbRepository.saveClientId(saveTx, clientId);
      await txDone(saveTx);

      const getTx = idbRepository.transaction("clientState", "readonly");
      const clientState = await idbRepository.getClientState(getTx);
      await txDone(getTx);

      expect(clientState.clientId).toBe(clientId);
    });
  });

  describe("Version management", () => {
    it("should set and retrieve version", async () => {
      const setTx = idbRepository.transaction("clientState", "readwrite");
      await idbRepository.setVersion(setTx, 5);
      await txDone(setTx);

      const getTx = idbRepository.transaction("clientState", "readonly");
      const version = await idbRepository.getVersion(getTx);
      await txDone(getTx);

      expect(version).toBe(5);
    });
  });

  describe("Index management", () => {
    afterEach(async () => {
      if (idbRepository?.db) {
        idbRepository.close();
      }
    });

    it("should create single-field index", async () => {
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-single-index");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);
      await repo.open("test-db-single-index");

      const tx = repo.transaction(["rows"], "readonly");
      const store = tx.objectStore("rows");

      // Verify index exists with correct internal name
      expect(store.indexNames.contains("users_usersByAge")).toBe(true);

      repo.close();
    });

    it("should create compound index", async () => {
      const indexes = [
        { name: "usersByName", table: "users", keys: ["firstName", "lastName"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-compound-index");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);
      await repo.open("test-db-compound-index");

      const tx = repo.transaction(["rows"], "readonly");
      const store = tx.objectStore("rows");

      expect(store.indexNames.contains("users_usersByName")).toBe(true);

      repo.close();
    });

    it("should create multiple indexes for same table", async () => {
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
        { name: "usersByName", table: "users", keys: ["firstName", "lastName"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-multiple-indexes");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);
      await repo.open("test-db-multiple-indexes");

      const tx = repo.transaction(["rows"], "readonly");
      const store = tx.objectStore("rows");

      expect(store.indexNames.contains("users_usersByAge")).toBe(true);
      expect(store.indexNames.contains("users_usersByName")).toBe(true);

      repo.close();
    });

    it("should allow same index name for different tables", async () => {
      const indexes = [
        { name: "byAge", table: "users", keys: ["age"] },
        { name: "byAge", table: "posts", keys: ["age"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-same-index-name");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);
      await repo.open("test-db-same-index-name");

      const tx = repo.transaction(["rows"], "readonly");
      const store = tx.objectStore("rows");

      // Both indexes exist with different internal names
      expect(store.indexNames.contains("users_byAge")).toBe(true);
      expect(store.indexNames.contains("posts_byAge")).toBe(true);

      repo.close();
    });

    it("should throw error for empty index name", async () => {
      const indexes = [
        { name: "", table: "users", keys: ["age"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-empty-index-name");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);

      await expect(repo.open("test-db-empty-index-name")).rejects.toThrow(
        "Index name cannot be empty",
      );
    });

    it("should throw error for empty table name", async () => {
      const indexes = [
        { name: "usersByAge", table: "", keys: ["age"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-empty-table-name");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);

      await expect(repo.open("test-db-empty-table-name")).rejects.toThrow(
        'Index "usersByAge": table name cannot be empty',
      );
    });

    it("should throw error for empty keys array", async () => {
      const indexes = [
        { name: "invalidIndex", table: "users", keys: [] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-empty-keys");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);

      await expect(repo.open("test-db-empty-keys")).rejects.toThrow(
        'Index "invalidIndex": keys array cannot be empty',
      );
    });

    it("should throw error for empty key name in keys array", async () => {
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age", ""] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-empty-key-name");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);

      await expect(repo.open("test-db-empty-key-name")).rejects.toThrow(
        'Index "usersByAge": key name cannot be empty',
      );
    });

    it("should throw error for duplicate index name on same table", async () => {
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
        { name: "usersByAge", table: "users", keys: ["createdAge"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-duplicate-index");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);

      await expect(repo.open("test-db-duplicate-index")).rejects.toThrow(
        "Index names must be unique per table",
      );
    });

    it("should create database at version 1 when no indexes", async () => {
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-no-indexes");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository();
      await repo.open("test-db-no-indexes");

      expect(repo.db?.version).toBe(1);

      repo.close();
    });

    it("should create database at version 1 when indexes exist", async () => {
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
      ];

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-with-indexes");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const repo = new IDBRepository(indexes);
      await repo.open("test-db-with-indexes");

      expect(repo.db?.version).toBe(1);

      repo.close();
    });
  });

  describe("Integration with CRDTDatabase", () => {
    it("should work with CRDTDatabase", async () => {
      const { CRDTDatabase } = await import("./crdtDatabase.ts");

      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-crdt-db-with-indexes");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      // Create IDBRepository with indexes first
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
      ];
      const idbRepo = new IDBRepository(indexes);

      const db = new CRDTDatabase(
        "test-crdt-db-with-indexes",
        indexes,
        "http://test.com",
        undefined,
        idbRepo,
      );

      await db.open();

      // Verify index was created (using type assertion to access private property in test)
      const tx = (db as any).idbRepository.transaction(["rows"], "readonly");
      const store = tx.objectStore("rows");
      expect(store.indexNames.contains("users_usersByAge")).toBe(true);
      await txDone(tx);

      // Verify data can still be written (existing functionality)
      await db.setRow("users", "u1", { age: 30, name: "Alice" });
      const user = await db.get("users", "u1");
      expect(user).toEqual({ age: 30, name: "Alice" });

      await db.close();
    });
  });

  describe("Query operations", () => {
    it("should query rows using a single-field index with exact match", async () => {
      // Setup: Create database with index
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase("test-db-query");
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });

      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
      ];
      const repo = new IDBRepository(indexes);
      await repo.open("test-db-query");

      // Insert test data
      const users = [
        { age: 25, name: "Alice" },
        { age: 30, name: "Bob" },
        { age: 25, name: "Charlie" },
        { age: 35, name: "David" },
      ];

      const saveTx = repo.transaction("rows", "readwrite");
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const row: ORMapRow = {
          [TABLE_NAME]: "users",
          [ROW_KEY]: `user${i}`,
          fields: {
            age: { value: user.age, dot: { clientId: "client1", version: i * 2 } },
            name: { value: user.name, dot: { clientId: "client1", version: i * 2 + 1 } },
          },
        };
        await repo.saveRow(saveTx, row);
      }
      await txDone(saveTx);

      // Query for age <= 27 (should match Alice and Charlie with age 25)
      const queryTx = repo.transaction("rows", "readonly");
      const query = below(27, true); // below or equal to 27

      const results: ORMapRow[] = [];
      for await (const row of repo.query(queryTx, "users", "usersByAge", query)) {
        results.push(row);
      }
      queryTx.commit();

      expect(results).toHaveLength(2);
      expect(results[0].fields.name.value).toBe("Alice");
      expect(results[1].fields.name.value).toBe("Charlie");

      repo.close();
    });
  });
});
