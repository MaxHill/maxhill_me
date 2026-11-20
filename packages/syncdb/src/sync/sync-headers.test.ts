import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sync } from "./index.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import "fake-indexeddb/auto";

describe("Sync headers provider", () => {
  let clientState: ClientState;
  let rowStore: RowStore;
  let operationLog: OperationLog;

  beforeEach(() => {
    clientState = new ClientState();
    rowStore = new RowStore();
    operationLog = new OperationLog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes custom headers from provider in fetch request", async () => {
    const headersProvider = async () => ({
      Authorization: "Bearer test-token",
      "X-Custom": "value",
    });
    const sync = new Sync(clientState, rowStore, operationLog, headersProvider);

    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      protocolVersion: 3,
      clientId: "client-1",
      baseServerVersion: 0,
      latestServerVersion: 1,
      lastMutationID: 0,
      responseHash: "abc",
      operations: [],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    const request = {
      protocolVersion: 3 as const,
      clientId: "client-1",
      dbName: "test-db",
      clientLastMutationID: 0,
      mutations: [],
      lastSeenServerVersion: 0,
      requestHash: "hash",
    };

    await sync.sendSyncRequest("http://localhost/sync", request);

    expect(mockFetch).toHaveBeenCalledWith("http://localhost/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
        "X-Custom": "value",
      },
      body: JSON.stringify(request),
    });
  });
});
