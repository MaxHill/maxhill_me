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

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        baseServerVersion: 0,
        latestServerVersion: 1,
        responseHash: "abc",
        operations: [],
        syncedOperations: [],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const request = {
      clientId: "client-1",
      dbName: "test-db",
      operations: [],
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

  it("works without a headers provider (backward compatible)", async () => {
    const sync = new Sync(clientState, rowStore, operationLog);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        baseServerVersion: 0,
        latestServerVersion: 1,
        responseHash: "abc",
        operations: [],
        syncedOperations: [],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const request = {
      clientId: "client-1",
      dbName: "test-db",
      operations: [],
      lastSeenServerVersion: 0,
      requestHash: "hash",
    };

    await sync.sendSyncRequest("http://localhost/sync", request);

    expect(mockFetch).toHaveBeenCalledWith("http://localhost/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  });
});
