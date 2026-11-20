import { afterEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { newDatabase } from "../crdtDatabase/builder.ts";
import {
  Lifecycle,
  CLIENT_STATE_STORE,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { Sync } from "./index.ts";
import { CRDTDatabase } from "../crdtDatabase/index.ts";

type Fixture = {
  db: CRDTDatabase<{ users: {} }>;
  lifecycle: Lifecycle;
  sync: Sync;
  clientState: ClientState;
  operationLog: OperationLog;
};

async function setup(dbName: string): Promise<Fixture> {
  const lifecycle = new Lifecycle();
  const clientState = new ClientState();
  const operationLog = new OperationLog();
  const sync = new Sync(clientState, new RowStore(), operationLog);
  const db = await newDatabase(dbName)
    .withCustomStorageRepository(lifecycle)
    .withCustomSync(sync)
    .withClientId("c1")
    .addTable("users", {})
    .build()
    .open();

  return { db, lifecycle, sync, clientState, operationLog };
}

async function deleteDb(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(name);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
}

const open: Array<{ dbName: string; db: CRDTDatabase<any> }> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const entry of open.splice(0)) {
    await entry.db.close();
    await deleteDb(entry.dbName);
  }
});

describe("Sync protocol v3 mutation frontier", () => {
  it("creates request using contiguous pending mutation IDs from real table writes", async () => {
    const dbName = `sync-${crypto.randomUUID()}`;
    const { db, lifecycle, sync } = await setup(dbName);
    open.push({ dbName, db });

    await db.table("users").setRow("u1", { name: "A" });
    await db.table("users").setRow("u2", { name: "B" });

    const readTx = lifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE], "readonly");
    const syncRequest = await sync.createSyncRequest(readTx, "db");

    expect(syncRequest.protocolVersion).toBe(3);
    expect(syncRequest.clientLastMutationID).toBe(0);
    expect(syncRequest.mutations.map((mutation) => mutation.id)).toEqual([1, 2]);
  });

  it("keeps mutation IDs dense across failed writes, acks, and reopen", async () => {
    const dbName = `sync-${crypto.randomUUID()}`;
    const fixture = await setup(dbName);
    open.push({ dbName, db: fixture.db });

    await fixture.db.table("users").setRow("u1", { name: "A" });
    await expect(
      fixture.db.table("users").setRow("u-invalid", {
        bad: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("SetRow operation has non-serializable field");

    const writes = await Promise.allSettled([
      fixture.db.table("users").setRow("u2", { name: "B" }),
      fixture.db.table("users").setRow("u3", { bad: NaN }),
    ]);
    expect(writes[0].status).toBe("fulfilled");
    expect(writes[1].status).toBe("rejected");

    await expectDenseMutations(fixture, [1, 2]);
    await applyRemoteAckAndOperation(fixture);
    await fixture.db.table("users").setRow("u4", { name: "C" });
    await expectDenseMutations(fixture, [1, 2, 3]);

    await fixture.db.close();
    fixture.db = await newDatabase(dbName)
      .withCustomStorageRepository(fixture.lifecycle)
      .withCustomSync(fixture.sync)
      .withClientId("c1")
      .addTable("users", {})
      .build()
      .open();
    open[0].db = fixture.db;

    await expectDenseMutations(fixture, [1, 2, 3]);
  });
});

describe("Sync protocol v3 request hash validation", () => {
  it("rejects unsafe existing pending mutation payloads during hash encoding", async () => {
    const dbName = `sync-${crypto.randomUUID()}`;
    const fixture = await setup(dbName);
    open.push({ dbName, db: fixture.db });

    await fixture.db.table("users").setRow("u1", { name: "A" });

    const writeTransaction = fixture.lifecycle.transaction(
      [CLIENT_STATE_STORE, OPERATIONS_STORE],
      "readwrite",
    );
    const unsafeMutationID = await fixture.clientState.allocateMutationID(writeTransaction);
    await fixture.operationLog.saveLocalPendingOperation(
      writeTransaction,
      {
        type: "setRow",
        tableName: "users",
        rowKey: "u-unsafe",
        fields: { bad: new Date("2026-01-01T00:00:00.000Z") },
        dot: { clientId: "c1", version: 999 },
      },
      unsafeMutationID,
    );
    await fixture.lifecycle.commit(writeTransaction);

    const readTx = fixture.lifecycle.transaction(
      [CLIENT_STATE_STORE, OPERATIONS_STORE],
      "readonly",
    );
    await expect(fixture.sync.createSyncRequest(readTx, "db")).rejects.toThrow("Invalid data");
  });
});

describe("Sync protocol v3 stale base handling", () => {
  it("applies ack monotonically for stale bases and skips remote operations", async () => {
    const dbName = `sync-${crypto.randomUUID()}`;
    const fixture = await setup(dbName);
    open.push({ dbName, db: fixture.db });

    await fixture.db.table("users").setRow("u1", { name: "A" });

    const transaction = fixture.lifecycle.transaction(
      [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE],
      "readwrite",
    );
    const changedTables = await fixture.sync.handleSyncResponse(
      transaction,
      new PersistedLogicalClock(fixture.clientState),
      {
        protocolVersion: 3,
        clientId: "c1",
        baseServerVersion: 5,
        latestServerVersion: 6,
        lastMutationID: 1,
        operations: [
          {
            type: "setRow",
            tableName: "users",
            rowKey: "remote-stale",
            fields: { name: "ignored" },
            dot: { clientId: "server", version: 7 },
            serverVersion: 6,
          },
        ],
        responseHash: "irrelevant",
      },
    );
    await fixture.lifecycle.commit(transaction);

    expect(changedTables.size).toBe(0);

    const readTx = fixture.lifecycle.transaction(
      [CLIENT_STATE_STORE, OPERATIONS_STORE],
      "readonly",
    );
    const ack = await fixture.clientState.getLastMutationID(readTx);
    const pending = await fixture.operationLog.getPendingMutationsByClient(readTx, "c1");
    const state = await fixture.clientState.getClientState(readTx);
    expect(ack).toBe(1);
    expect(pending).toHaveLength(0);
    expect(state.lastSeenServerVersion).toBe(-1);
    await expect(fixture.db.table("users").get("remote-stale")).resolves.toBeUndefined();
  });
});

describe("Sync protocol v3 response validation", () => {
  it("rejects ack beyond generated frontier and wrong-client responses", async () => {
    const dbName = `sync-${crypto.randomUUID()}`;
    const fixture = await setup(dbName);
    open.push({ dbName, db: fixture.db });

    await fixture.db.table("users").setRow("u1", { name: "A" });

    const transaction = fixture.lifecycle.transaction(
      [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE],
      "readwrite",
    );
    await expect(
      fixture.sync.handleSyncResponse(
        transaction,
        new PersistedLogicalClock(fixture.clientState),
        {
          protocolVersion: 3,
          clientId: "c1",
          baseServerVersion: -1,
          latestServerVersion: 1,
          lastMutationID: 2,
          operations: [],
          responseHash: "irrelevant",
        },
      ),
    ).rejects.toThrow("beyond local frontier");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          protocolVersion: 3,
          clientId: "wrong-client",
          baseServerVersion: 0,
          latestServerVersion: 0,
          lastMutationID: 0,
          responseHash: "",
          operations: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      fixture.sync.sendSyncRequest("http://localhost/sync", {
        protocolVersion: 3,
        clientId: "c1",
        dbName: "db",
        clientLastMutationID: 0,
        mutations: [],
        lastSeenServerVersion: 0,
        requestHash: "",
      }),
    ).rejects.toThrow("Invalid sync response clientId");
  });
});

async function expectDenseMutations(fixture: Fixture, expected: number[]): Promise<void> {
  const readTx = fixture.lifecycle.transaction(
    [CLIENT_STATE_STORE, OPERATIONS_STORE],
    "readonly",
  );
  const syncRequest = await fixture.sync.createSyncRequest(readTx, "db");
  expect(syncRequest.mutations.map((mutation) => mutation.id)).toEqual(expected);
}

async function applyRemoteAckAndOperation(fixture: Fixture): Promise<void> {
  const remoteTx = fixture.lifecycle.transaction(
    [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE],
    "readwrite",
  );
  await fixture.sync.handleSyncResponse(remoteTx, new PersistedLogicalClock(fixture.clientState), {
    protocolVersion: 3,
    clientId: "c1",
    baseServerVersion: -1,
    latestServerVersion: 99,
    lastMutationID: 0,
    responseHash: "irrelevant",
    operations: [
      {
        type: "setRow",
        tableName: "users",
        rowKey: "remote",
        fields: { name: "R" },
        dot: { clientId: "server", version: 99 },
        serverVersion: 99,
      },
    ],
  });
  await fixture.lifecycle.commit(remoteTx);
}
