import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newDatabase } from "./builder.ts";
import {
  Lifecycle,
  CLIENT_STATE_STORE,
  OPERATIONS_STORE,
} from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { Sync, type SyncResponse } from "../sync/index.ts";
import { encodeCanonicalJson } from "../sync/canonical-json.ts";
import type { CRDTOperation } from "../crdt.ts";

function checkpoint(): CRDTOperation {
  return {
    type: "checkpointRow",
    tableName: "users",
    rowKey: "u1",
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
    type: "setRow",
    tableName: "users",
    rowKey: "u1",
    dot: { clientId: "writer", version: 1 },
    fields: { name, meta: { b: [true], a: 1 } },
    serverVersion,
  };
}

async function hashResponse(response: Omit<SyncResponse, "responseHash">): Promise<string> {
  const parts = [
    "3",
    response.clientId,
    String(response.baseServerVersion),
    String(response.latestServerVersion),
    String(response.lastMutationID),
  ];

  for (const operation of response.operations) {
    parts.push(
      operation.type,
      operation.tableName,
      String(operation.rowKey),
      operation.dot.clientId,
      String(operation.dot.version),
    );
    if (operation.type === "setRow") {
      parts.push("null", encodeCanonicalJson(operation.fields));
    } else if (operation.type === "checkpointRow") {
      parts.push(
        "null",
        encodeCanonicalJson({ fields: operation.fields }),
        String(operation.checkpointSeenServerVersion),
      );
    } else {
      parts.push("null", "null");
    }
    parts.push(String(operation.serverVersion));
  }

  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("|")));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function buildResponse(
  operations: CRDTOperation[],
  baseServerVersion = -1,
  latestServerVersion = 5,
): Promise<SyncResponse> {
  const withoutHash: Omit<SyncResponse, "responseHash"> = {
    protocolVersion: 3,
    clientId: "reader",
    baseServerVersion,
    latestServerVersion,
    lastMutationID: 0,
    operations,
  };
  return { ...withoutHash, responseHash: await hashResponse(withoutHash) };
}

async function openFixture(name = `checkpoint-${crypto.randomUUID()}`) {
  const lifecycle = new Lifecycle([]);
  const sync = new Sync(new ClientState(), new RowStore([]), new OperationLog());
  const db = await newDatabase(name)
    .addTable("users", {})
    .addTable("todos", {})
    .withClientId("reader")
    .withCustomStorageRepository(lifecycle)
    .withCustomSync(sync)
    .build()
    .open();
  return { name, lifecycle, sync, db };
}

let fixture: Awaited<ReturnType<typeof openFixture>>;
beforeEach(async () => { fixture = await openFixture(); });
afterEach(async () => {
  await fixture.db.close();
  await new Promise<void>((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(fixture.name);
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
});

async function requestState() {
  const transaction = fixture.lifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]);
  return fixture.sync.createSyncRequest(transaction, fixture.name);
}

describe("checkpoint replay", () => {
  it("applies checkpoint and overlap write", async () => {
    const incoming = await buildResponse([checkpoint(), write()]);
    expect(await fixture.sync.validateResponseHash(incoming)).toBe(true);
    await expect(fixture.db.sync(incoming)).resolves.toBeUndefined();
    expect(await fixture.db.table("users").get("u1")).toEqual({
      _key: "u1",
      name: "Alice",
      meta: { a: 1, b: [true] },
    });
    expect((await requestState()).lastSeenServerVersion).toBe(5);
  });

  it("keeps local pending mutations", async () => {
    const users = fixture.db.table("users");
    await users.setRow("u1", { name: "Local" });
    await fixture.db.sync(await buildResponse([checkpoint(), write()]));
    const pending = (await requestState()).mutations;
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(1);
  });
});
