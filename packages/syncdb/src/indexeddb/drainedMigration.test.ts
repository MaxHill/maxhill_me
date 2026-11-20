import { afterEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { migrateDrainedReplica } from "./drainedMigration.ts";
import { newDatabase } from "../crdtDatabase/builder.ts";
import { promisifyIDBRequest } from "../utils.ts";
import { ClientState } from "./clientState.ts";
import { Lifecycle } from "./lifecycle.ts";
import { OperationLog } from "./operationLog.ts";
import { RowStore } from "./rowStore.ts";
import { Sync } from "../sync/index.ts";

const names = new Set<string>();
afterEach(async () => {
  for (const name of names) {
    await promisifyIDBRequest(indexedDB.deleteDatabase(name));
  }
  names.clear();
});
function pair() {
  const source = `legacy-${crypto.randomUUID()}`;
  const target = `${source}-v3`;
  names.add(source);
  names.add(target);
  return { source, target };
}
async function legacy(name: string, pending = false, clock = 900) {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    const rows = database.createObjectStore("rows", { keyPath: ["table_name", "row_key"] });
    rows.createIndex("by-table", "table_name");
    rows.put({
      table_name: "users", row_key: "u1", fields: {
        name: { value: "Preserved", dot: { clientId: "old", version: 900 } },
      },
    });
    const operations = database.createObjectStore("operations", {
      keyPath: ["op.dot.clientId", "op.dot.version"],
    });
    operations.createIndex("by-synced", "synced");
    operations.put({ "op": { dot: { clientId: "old", version: 900 } }, synced: pending ? 0 : 1 });
    const state = database.createObjectStore("clientState");
    state.put(3, "syncProtocolVersion");
    state.put("old", "clientId");
    state.put(clock, "logicalClock");
    state.put(12, "lastSeenServerVersion");
    state.put("owner", "applicationMetadata");
  };
  const database = await promisifyIDBRequest(request);
  database.close();
}

async function readLegacy(name: string) {
  const database = await promisifyIDBRequest(indexedDB.open(name));
  try {
    const transaction = database.transaction(["rows", "clientState", "operations"]);
    return await Promise.all([
      promisifyIDBRequest(transaction.objectStore("rows").getAll()),
      promisifyIDBRequest(transaction.objectStore("clientState").getAll()),
      promisifyIDBRequest(transaction.objectStore("operations").getAll()),
    ]);
  } finally {
    database.close();
  }
}

describe("drained replica migration", () => {
  it("preserves rows, rotates identity, and separates mutations from pull", async () => {
    const { source, target } = pair();
    await legacy(source, false, 100);
    const before = await readLegacy(source);
    await migrateDrainedReplica(source, target);
    expect(await readLegacy(source)).toEqual(before);
    const lifecycle = new Lifecycle([{ table: "users", name: "byName", keys: ["name"] }]);
    const clientState = new ClientState();
    const sync = new Sync(clientState, new RowStore(), new OperationLog());
    const database = await newDatabase("remote-name")
      .withLocalDatabaseName(target).withCustomStorageRepository(lifecycle)
      .withCustomSync(sync).addTable("users", { byName: ["name"] }).build().open();
    try {
      expect(database.clientId).not.toBe("old");
      expect(await database.table("users").get("u1")).toEqual({ _key: "u1", name: "Preserved" });
      await database.table("users").setRow("u1", { name: "New" });
      const request = await sync.createSyncRequest(
        lifecycle.transaction(["clientState", "operations"]), database.dbName,
      );
      expect(request.dbName).toBe("remote-name");
      expect(request.clientLastMutationID).toBe(0);
      expect(request.lastSeenServerVersion).toBe(-1);
      expect(request.mutations[0].id).toBe(1);
      expect(request.mutations[0].operation.dot.version).toBe(901);
      const metadata = await promisifyIDBRequest(
        lifecycle.transaction("clientState").objectStore("clientState").get("applicationMetadata"),
      );
      expect(metadata).toBe("owner");
      const version = lifecycle.db!.version;
      await migrateDrainedReplica(source, target);
      expect(lifecycle.db!.version).toBe(version);
    } finally {
      await database.close();
    }
    await migrateDrainedReplica(source, target);
    const reopened = await newDatabase("remote-name").withLocalDatabaseName(target)
      .addTable("users", { byName: ["name"] }).build().open();
    try {
      expect(await reopened.table("users").get("u1")).toEqual({ _key: "u1", name: "New" });
    } finally {
      await reopened.close();
    }
  });

});

describe("drained migration refusal", () => {
  it("refuses pending work without changing the source or importing rows", async () => {
    const { source, target } = pair();
    await legacy(source, true);
    const before = await readLegacy(source);
    await expect(migrateDrainedReplica(source, target)).rejects.toThrow("pending");
    expect(await readLegacy(source)).toEqual(before);
    const database = await newDatabase("remote").withLocalDatabaseName(target)
      .addTable("users", {}).build().open();
    try {
      expect(await database.table("users").get("u1")).toBeUndefined();
    } finally {
      await database.close();
    }
  });

});

describe("drained migration retry", () => {
  it("serializes concurrent imports and keeps the allocated identity", async () => {
    const { source, target } = pair();
    await legacy(source);
    await Promise.all([
      migrateDrainedReplica(source, target), migrateDrainedReplica(source, target),
    ]);
    const first = await newDatabase("remote").withLocalDatabaseName(target)
      .addTable("users", {}).build().open();
    const identity = first.clientId;
    await first.close();
    await migrateDrainedReplica(source, target);
    const second = await newDatabase("remote").withLocalDatabaseName(target)
      .addTable("users", {}).build().open();
    expect(second.clientId).toBe(identity);
    await second.close();
  });

});

describe("drained migration integrity", () => {
  it("refuses a different source and malformed rows without an import receipt", async () => {
    const { source, target } = pair();
    await legacy(source);
    await migrateDrainedReplica(source, target);
    await expect(migrateDrainedReplica(`${source}-other`, target))
      .rejects.toThrow("different source");
    const malformed = pair();
    await legacy(malformed.source);
    const sourceDatabase = await promisifyIDBRequest(indexedDB.open(malformed.source));
    const transaction = sourceDatabase.transaction("rows", "readwrite");
    await promisifyIDBRequest(transaction.objectStore("rows").put({
      table_name: "users", row_key: "u1",
    }));
    sourceDatabase.close();
    await expect(migrateDrainedReplica(malformed.source, malformed.target))
      .rejects.toThrow("Unsupported legacy row");
    const destination = await promisifyIDBRequest(indexedDB.open(malformed.target));
    try {
      expect(await promisifyIDBRequest(destination.transaction("clientState")
        .objectStore("clientState").get("drainedImportSource"))).toBeUndefined();
      expect(await promisifyIDBRequest(destination.transaction("rows")
        .objectStore("rows").count())).toBe(0);
    } finally {
      destination.close();
    }
  });

  it("creates a fresh target without creating an absent legacy store", async () => {
    const { source, target } = pair();
    await migrateDrainedReplica(source, target);
    const databases = await indexedDB.databases();
    expect(databases.some((database) => database.name === source)).toBe(false);
    expect(databases.some((database) => database.name === target)).toBe(true);
  });
});
