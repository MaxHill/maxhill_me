import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CRDTDatabase } from ".";
import { below } from "../indexes";
import "fake-indexeddb/auto";
import { newDatabase } from "./builder.ts";
import { IDBRepository } from "../IDBRepository.ts";

describe("CRDTDatabase", () => {
  const dbName = "test-crdt-query";
  let db: CRDTDatabase<{ users: { usersByAge: string[] } }>;
  let idbRepository: IDBRepository;

  beforeEach(async () => {
    idbRepository = new IDBRepository([{
      table: "users",
      name: "usersByAge",
      keys: ["age"],
    }]);

    db = await newDatabase("test").addTable("users", {
      usersByAge: ["age"],
    })
      .withCustomStorageRepository(idbRepository)
      .build()
      .open();
  });

  afterEach(async () => {
    // Delete the database to start fresh
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(dbName);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });

    // Clean up: close database
    if (db) {
      await db.close();
    }
  });

  describe("query", () => {
    it("should query rows using an index and return simplified results", async () => {
      const users = db.table("users");

      // Insert test data
      await users.setRow("u1", { age: 25, name: "Alice" });
      await users.setRow("u2", { age: 30, name: "Bob" });
      await users.setRow("u3", { age: 25, name: "Charlie" });
      await users.setRow("u4", { age: 35, name: "David" });

      // Query for users with age <= 27
      const results: any[] = [];
      for await (const row of users.index("usersByAge").query(below(27, { inclusive: true }))) {
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
    it("should throw error when setRow _key differs from rowKey", async () => {
      await expect(
        db.table("users").setRow("u1", { _key: "u2", name: "Alice" }),
      ).rejects.toThrow("Cannot set _key to a different value");
    });

    it("should throw error when setCell targets _key field", async () => {
      await db.table("users").setRow("u1", { name: "Alice" });
      await expect(
        db.table("users").setField("u1", "_key", "different"),
      ).rejects.toThrow("Cannot set _key field directly");
    });

    it("should strip matching _key when setting row", async () => {
      // Should succeed and strip the _key
      await db.table("users").setRow("u1", { _key: "u1", name: "Alice", age: 30 });

      // Access raw storage to verify _key was stripped
      const tx = idbRepository.transaction(["rows"], "readonly");
      const row = await idbRepository.getRow(tx, "users", "u1");

      // Verify _key is NOT in the stored fields
      expect(row.fields).not.toHaveProperty("_key");
      expect(row.fields).toHaveProperty("name");
      expect(row.fields).toHaveProperty("age");

      // Verify get() still returns _key (injected, not stored)
      const result = await db.table("users").get("u1");
      expect(result).toEqual({ _key: "u1", name: "Alice", age: 30 });
    });
  });
});
