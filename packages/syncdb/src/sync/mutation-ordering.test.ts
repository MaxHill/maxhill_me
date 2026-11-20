import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newDatabase } from "../crdtDatabase/builder.ts";
import {
  Lifecycle,
  CLIENT_STATE_STORE,
  OPERATIONS_STORE,
  ROWS_STORE,
} from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { PersistedLogicalClock } from "../persistedLogicalClock.ts";
import { Sync, type SyncResponse } from "./index.ts";

async function open(name = `ordering-${crypto.randomUUID()}`) {
  const lifecycle = new Lifecycle([]);
  const clientState = new ClientState();
  const sync = new Sync(clientState, new RowStore([]), new OperationLog());
  const db = await newDatabase(name)
    .addTable("users", {})
    .withClientId("ordering-client")
    .withCustomStorageRepository(lifecycle)
    .withCustomSync(sync)
    .build()
    .open();
  return { name, lifecycle, clientState, sync, db };
}

let fixture: Awaited<ReturnType<typeof open>>;
const opened: Array<Awaited<ReturnType<typeof open>>> = [];
beforeEach(async () => { fixture = await open(); opened.push(fixture); });
afterEach(async () => {
  const names = new Set(opened.map((entry) => entry.name));
  for (const entry of opened.splice(0)) {
    await entry.db.close();
  }
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(name);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });
  }
});

async function createRequest() {
  return fixture.sync.createSyncRequest(
    fixture.lifecycle.transaction([CLIENT_STATE_STORE, OPERATIONS_STORE]), fixture.name,
  );
}

async function applyAcknowledgement(lastMutationID: number) {
  const transaction = fixture.lifecycle.transaction(
    [CLIENT_STATE_STORE, OPERATIONS_STORE, ROWS_STORE], "readwrite",
  );
  const response: SyncResponse = {
    protocolVersion: 3, clientId: "ordering-client", baseServerVersion: -1,
    latestServerVersion: -1, lastMutationID, operations: [], responseHash: "application-seam",
  };
  await fixture.sync.handleSyncResponse(
    transaction, new PersistedLogicalClock(fixture.clientState), response,
  );
  await fixture.lifecycle.commit(transaction);
}

describe("ordered mutation prefixes", () => {
  it("deletes only the acknowledged prefix and ignores an older acknowledgement", async () => {
    for (let index = 0; index < 3; index += 1) {
      await fixture.db.table("users").setRow(String(index), { name: String(index) });
    }
    await applyAcknowledgement(2);
    const first = await createRequest();
    expect(first.clientLastMutationID).toBe(2);
    expect(first.mutations.map((mutation) => mutation.id)).toEqual([3]);
    await applyAcknowledgement(1);
    const second = await createRequest();
    expect(second.clientLastMutationID).toBe(2);
    expect(second.mutations.map((mutation) => mutation.id)).toEqual([3]);
  });

  it("shares dense allocation across connections to the same local replica", async () => {
    const second = await open(fixture.name);
    opened.push(second);
    await Promise.all([
      fixture.db.table("users").setRow("a", { name: "A" }),
      second.db.table("users").setRow("b", { name: "B" }),
    ]);
    const pending = await createRequest();
    expect(pending.mutations.map((mutation) => mutation.id)).toEqual([1, 2]);
    expect(pending.mutations.map((mutation) => mutation.operation.dot.version)).toEqual([0, 1]);
  });
});

describe("bounded numeric mutation state", () => {
  it("refuses mutation ID overflow without committing the write", async () => {
    const transaction = fixture.lifecycle.transaction(CLIENT_STATE_STORE, "readwrite");
    transaction
      .objectStore(CLIENT_STATE_STORE)
      .put(Number.MAX_SAFE_INTEGER, "lastGeneratedMutationID");
    transaction.objectStore(CLIENT_STATE_STORE).put(Number.MAX_SAFE_INTEGER, "lastMutationID");
    await fixture.lifecycle.commit(transaction);
    await expect(fixture.db.table("users").setRow("overflow", { name: "kept" }))
      .rejects.toThrow("safe integer");
    expect(await fixture.db.table("users").get("overflow")).toBeUndefined();
    expect((await createRequest()).mutations).toEqual([]);
  });

  it("aborts mutation allocation if the logical clock cannot advance", async () => {
    const transaction = fixture.lifecycle.transaction(CLIENT_STATE_STORE, "readwrite");
    await fixture.clientState.setVersion(transaction, Number.MAX_SAFE_INTEGER);
    await fixture.lifecycle.commit(transaction);
    await expect(fixture.db.table("users").setRow("overflow", { name: "kept" }))
      .rejects.toThrow("safe integer");
    const pending = await createRequest();
    expect(pending.mutations).toEqual([]);
    expect(pending.clientLastMutationID).toBe(0);
  });
});
