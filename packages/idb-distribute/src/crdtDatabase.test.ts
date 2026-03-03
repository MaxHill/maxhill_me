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
      expect(results[0]).toEqual({ age: 25, name: "Alice" });
      expect(results[1]).toEqual({ age: 25, name: "Charlie" });

      // Verify no CRDT metadata in results
      expect(results[0]).not.toHaveProperty("dot");
      expect(results[0]).not.toHaveProperty("clientId");
      expect(results[0]).not.toHaveProperty("version");
      expect(results[0]).not.toHaveProperty("fields");
    });
  });

  // TODO: test more cases
});
