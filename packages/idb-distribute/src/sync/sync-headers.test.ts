import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sync } from "./index.ts";
import { IDBRepository } from "../IDBRepository.ts";
import "fake-indexeddb/auto";

describe("Sync headers provider", () => {
  let idbRepository: IDBRepository;

  beforeEach(() => {
    idbRepository = new IDBRepository([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes custom headers from provider in fetch request", async () => {
    const headersProvider = async () => ({
      Authorization: "Bearer test-token",
      "X-Custom": "value",
    });

    const sync = new Sync(idbRepository, headersProvider);

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
    const sync = new Sync(idbRepository);

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
