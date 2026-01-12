import { IDBRepository } from "./IDBRepository";
import { promisifyIDBRequest, txDone } from "./utils";
import { CRDTOperation, ORMapRow } from "./crdt";
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
        fields: {
          name: { value: "John", dot: { clientId: "client1", version: 1 } },
          age: { value: 30, dot: { clientId: "client1", version: 2 } },
        },
      };

      const saveTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(saveTx, "users", "user1", row);
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
        fields: {
          name: { value: "Jane", dot: { clientId: "client1", version: 1 } },
        },
        tombstone: {
          dot: { clientId: "client1", version: 3 },
          context: { client1: 2 },
        },
      };

      const saveTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(saveTx, "users", "user2", row);
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

      expect(retrieved).toEqual({ fields: {} });
    });

    it("should delete row when fields are empty and no tombstone", async () => {
      // First save a row
      const row: ORMapRow = {
        fields: {
          name: { value: "Bob", dot: { clientId: "client1", version: 1 } },
        },
      };

      const saveTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(saveTx, "users", "user3", row);
      await txDone(saveTx);

      // Now save an empty row (should delete it)
      const emptyRow: ORMapRow = { fields: {} };
      const deleteTx = idbRepository.transaction("rows", "readwrite");
      await idbRepository.saveRow(deleteTx, "users", "user3", emptyRow);
      await txDone(deleteTx);

      // Try to retrieve it
      const getTx = idbRepository.transaction("rows", "readonly");
      const retrieved = await idbRepository.getRow(getTx, "users", "user3");
      await txDone(getTx);

      expect(retrieved).toEqual({ fields: {} });
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
      await idbRepository.logOperation(logTx, op);
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
      await idbRepository.logOperation(logTx, op);
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
      await idbRepository.logOperation(logTx, op);
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
});
