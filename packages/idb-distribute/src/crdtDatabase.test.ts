import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CRDTDatabase } from "./crdtDatabase.ts";
import { below } from "./indexes.ts";
import "fake-indexeddb/auto";

describe("CRDTDatabase", () => {
  let db: CRDTDatabase;
  const dbName = "test-crdt-query";

  beforeEach(async () => {
    // Close existing database if open
    if (db) {
      await db.close();
    }

    // Delete the database to start fresh
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(dbName);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });
  });

  afterEach(async () => {
    // Clean up: close database
    if (db) {
      await db.close();
    }
  });

  describe("query", () => {
    it("should query rows using an index and return simplified results", async () => {
      // Create database with index
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
      ];
      db = new CRDTDatabase(dbName, indexes, "http://test.com");
      await db.open();

      // Insert test data
      await db.setRow("users", "u1", { age: 25, name: "Alice" });
      await db.setRow("users", "u2", { age: 30, name: "Bob" });
      await db.setRow("users", "u3", { age: 25, name: "Charlie" });
      await db.setRow("users", "u4", { age: 35, name: "David" });

      // Query for users with age <= 27
      const results: any[] = [];
      for await (const row of db.query("users", "usersByAge", below(27, { inclusive: true }))) {
        results.push(row);
      }

      // Assertions
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ _key: "u1", age: 25, name: "Alice" });
      expect(results[1]).toEqual({ _key: "u3", age: 25, name: "Charlie" });

      // Verify no CRDT metadata in results
      expect(results[0]).not.toHaveProperty("dot");
      expect(results[0]).not.toHaveProperty("clientId");
      expect(results[0]).not.toHaveProperty("version");
      expect(results[0]).not.toHaveProperty("fields");
    });
  });

  describe("_key validation", () => {
    beforeEach(async () => {
      const indexes = [
        { name: "usersByAge", table: "users", keys: ["age"] },
      ];
      db = new CRDTDatabase(dbName, indexes, "http://test.com");
      await db.open();
    });

    it("should throw error when setRow _key differs from rowKey", async () => {
      await expect(
        db.setRow("users", "u1", { _key: "u2", name: "Alice" })
      ).rejects.toThrow("Cannot set _key to a different value");
    });

    it("should throw error when setCell targets _key field", async () => {
      await db.setRow("users", "u1", { name: "Alice" });
      await expect(
        db.setCell("users", "u1", "_key", "different")
      ).rejects.toThrow("Cannot set _key field directly");
    });

    it("should strip matching _key when setting row", async () => {
      // Should succeed and strip the _key
      await db.setRow("users", "u1", { _key: "u1", name: "Alice", age: 30 });
      
      // Access raw storage to verify _key was stripped
      const tx = db["idbRepository"].transaction(["rows"], "readonly");
      const row = await db["idbRepository"].getRow(tx, "users", "u1");
      
      // Verify _key is NOT in the stored fields
      expect(row.fields).not.toHaveProperty("_key");
      expect(row.fields).toHaveProperty("name");
      expect(row.fields).toHaveProperty("age");
      
      // Verify get() still returns _key (injected, not stored)
      const result = await db.get("users", "u1");
      expect(result).toEqual({ _key: "u1", name: "Alice", age: 30 });
    });
  });
});
