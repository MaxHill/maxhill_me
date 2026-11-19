import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newDatabase } from "./builder.ts";
import { Lifecycle, CLIENT_STATE_STORE, OPERATIONS_STORE } from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { Sync, type SyncResponse } from "../sync/index.ts";
import type { CRDTOperation } from "../crdt.ts";

function checkpoint(): CRDTOperation {
  return {
    type: "checkpointRow", tableName: "users", rowKey: "u1",
    dot: { clientId: "checkpoint:users:u1", version: 10 },
    checkpointSeenServerVersion: 4,
    fields: {
      name: { value: "Alice", dot: { clientId: "writer", version: 1 } },
      meta: { value: { a: 1, b: [true] }, dot: { clientId: "writer", version: 1 } },
    },
    serverVersion: 4,
  };
}

function write(name = "Alice", serverVersion = 5): CRDTOperation {
  return {
    type: "setRow", tableName: "users", rowKey: "u1",
    dot: { clientId: "writer", version: 1 },
    fields: { name, meta: { b: [true], a: 1 } }, serverVersion,
  };
}

// Fixed hashes generated with the production OCaml hash_sync_response routine.
function response(
  operations: CRDTOperation[],
  responseHash: string,
  baseServerVersion = -1,
  latestServerVersion = 5,
): SyncResponse {
  return { baseServerVersion, latestServerVersion, operations, syncedOperations: [], responseHash };
}

async function openFixture(name = `checkpoint-${crypto.randomUUID()}`) {
  const lifecycle = new Lifecycle([]);
  const sync = new Sync(new ClientState(), new RowStore([]), new OperationLog());
  const db = await newDatabase(name).addTable("users", {}).addTable("todos", {})
    .withClientId("reader").withCustomStorageRepository(lifecycle).withCustomSync(sync)
    .build().open();
  return { name, lifecycle, sync, db };
}

let fixture: Awaited<ReturnType<typeof openFixture>>;
beforeEach(async () => { fixture = await openFixture(); });
afterEach(async () => {
  await fixture.db.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(fixture.name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

async function requestState() {
  const transaction = fixture.lifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
  return fixture.sync.createSyncRequest(transaction, fixture.name);
}

describe("checkpoint field replay through database sync", () => {
  it("commits checkpoint/write overlap and persists it after reopen", async () => {
    const incoming = response(
      [checkpoint(), write()],
      "f65a4888daf0561e537a1d3955cab5e82af71254c04c5b58af89eb20202c126c",
    );
    expect(await fixture.sync.validateResponseHash(incoming)).toBe(true);
    await expect(fixture.db.sync(incoming)).resolves.toBeUndefined();
    expect(await fixture.db.table("users").get("u1")).toEqual({
      _key: "u1", name: "Alice", meta: { a: 1, b: [true] },
    });
    expect((await requestState()).lastSeenServerVersion).toBe(5);
    const name = fixture.name;
    await fixture.db.close();
    fixture = await openFixture(name);
    expect(await fixture.db.table("users").get("u1")).toEqual({
      _key: "u1", name: "Alice", meta: { a: 1, b: [true] },
    });
  });
});

describe("checkpoint responses across transactions", () => {
  it("accepts a checkpoint in one response and its overlapping write in the next", async () => {
    await fixture.db.sync(response(
      [checkpoint()], "789be822b15d9a80b6313abccd41add668f6ab314d808478c3f0fa5e561134c9", -1, 4,
    ));
    await fixture.db.sync(response(
      [write()], "a611c05017f2baeb778a42793571c5f70eed7e75733600251aeddf2149aa8249", 4, 5,
    ));
    expect(await fixture.db.table("users").get("u1")).toEqual({
      _key: "u1", name: "Alice", meta: { a: 1, b: [true] },
    });
    expect((await requestState()).lastSeenServerVersion).toBe(5);
  });

  it("accepts the reversed write and checkpoint order", async () => {
    await fixture.db.sync(response(
      [write("Alice", 3), checkpoint()],
      "a6b8023d8d448cd0aca35a2347d901a711e94e77d5dcd5ad790f69a09368b023", -1, 4,
    ));
    expect(await fixture.db.table("users").get("u1")).toEqual({
      _key: "u1", name: "Alice", meta: { b: [true], a: 1 },
    });
    expect((await requestState()).lastSeenServerVersion).toBe(4);
  });

  it("preserves newer local fields and unsynced operations", async () => {
    const users = fixture.db.table("users");
    await users.setRow("u1", { name: "First" });
    await users.setRow("u1", { name: "Second" });
    await users.setRow("u1", { name: "Newest" });
    await fixture.db.sync(response(
      [checkpoint(), write()],
      "f65a4888daf0561e537a1d3955cab5e82af71254c04c5b58af89eb20202c126c",
    ));
    expect(await users.get("u1")).toEqual({
      _key: "u1", name: "Newest", meta: { a: 1, b: [true] },
    });
    const pending = (await requestState()).operations;
    expect(pending.map((operation) => operation.dot.version)).toEqual([0, 1, 2]);
  });
});

async function expectRollback(incoming: SyncResponse) {
  expect(await fixture.sync.validateResponseHash(incoming)).toBe(true);
  await expect(fixture.db.sync(incoming)).rejects.toBeDefined();
  expect(await fixture.db.table("users").get("u1")).toBeUndefined();
  expect(await fixture.db.table("users").get("other")).toBeUndefined();
  expect((await requestState()).lastSeenServerVersion).toBe(-1);
}

describe("equal-dot conflict rollback with existing failure propagation", () => {
  it("rolls back earlier row writes when a write conflicts with a checkpoint", async () => {
    const other: CRDTOperation = {
      type: "setRow", tableName: "users", rowKey: "other",
      dot: { clientId: "other-writer", version: 2 }, fields: { name: "Other" }, serverVersion: 2,
    };
    await expectRollback(response(
      [other, checkpoint(), write("Bob")],
      "4f838faad04bc4149151e0b4b353511c2d2a54a8a1c86d39209c92fe5c1ae8a4",
    ));
  });

  it("also rejects a checkpoint conflicting with an already-applied write", async () => {
    await expectRollback(response(
      [write("Bob", 3), checkpoint()],
      "46ee28577f93284bdd4391b3c861f4ecbccf66d2dde66d3f3ef7189e816c267d", -1, 4,
    ));
  });
});

function coveredAcknowledgement(cleanup = false): SyncResponse {
  const version = cleanup ? 3 : 2;
  return {
    baseServerVersion: cleanup ? 2 : -1, latestServerVersion: version,
    operations: [{
      type: "checkpointRow", tableName: "todos", rowKey: "r1",
      dot: { clientId: "checkpoint:todos:r1", version },
      checkpointSeenServerVersion: version,
      fields: { title: { value: "original", dot: { clientId: "reader", version: 0 } } },
      serverVersion: version,
    }],
    syncedOperations: cleanup ? [] : [
      { dot: { clientId: "reader", version: 0 }, serverVersion: 2 },
    ],
    // Generated by assert_covered_ack_client_contract using the real OCaml sync engine.
    responseHash: cleanup
      ? "b77b60713d082f35a3002034b08020033d03677175d9710464ac11baf83a5bd2"
      : "6dd70c0b6bbc9702bbd865041d19b82b14a0efaa0b622495f5d95549e0c2c44e",
  };
}

describe("server checkpoint-covered acknowledgements", () => {
  it("clears the covered upload, preserves pending work, and permits later cleanup", async () => {
    const todos = fixture.db.table("todos");
    await todos.setRow("r1", { title: "original" });
    await todos.setRow("other", { title: "pending" });
    expect((await requestState()).operations).toHaveLength(2);
    const incoming = coveredAcknowledgement();
    expect(await fixture.sync.validateResponseHash(incoming)).toBe(true);
    await fixture.db.sync(incoming);
    const afterAck = (await requestState()).operations;
    expect(afterAck.map((operation) => operation.dot.version)).toEqual([1]);
    expect(await todos.get("r1")).toEqual({ _key: "r1", title: "original" });

    const name = fixture.name;
    await fixture.db.close();
    fixture = await openFixture(name);
    expect((await requestState()).lastSeenServerVersion).toBe(2);
    const afterReopen = (await requestState()).operations;
    expect(afterReopen.map((operation) => operation.dot.version)).toEqual([1]);
    expect(await fixture.db.table("todos").get("other"))
      .toEqual({ _key: "other", title: "pending" });

    const cleanup = coveredAcknowledgement(true);
    expect(await fixture.sync.validateResponseHash(cleanup)).toBe(true);
    await fixture.db.sync(cleanup);
    const operations = await new OperationLog().getAllOperations(
      fixture.lifecycle.transaction(OPERATIONS_STORE),
    );
    expect(operations).toHaveLength(2);
    expect(operations.map((operation) => operation.dot)).not.toContainEqual({
      clientId: "reader", version: 0,
    });
    const afterCleanup = (await requestState()).operations;
    expect(afterCleanup.map((operation) => operation.dot.version)).toEqual([1]);
    expect(await fixture.db.table("todos").get("r1")).toEqual({ _key: "r1", title: "original" });
    expect((await requestState()).lastSeenServerVersion).toBe(3);
  });
});
