import { afterEach, describe, expect, it, vi } from "vitest";
import { Sync, type SyncRequest } from "./index.ts";
import { SyncErrorCode } from "./errors.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";

const endpoint = "http://localhost/sync";
const request: SyncRequest = {
  clientId: "client-1",
  dbName: "test-db",
  operations: [],
  lastSeenServerVersion: 0,
  requestHash: "hash",
};

function createSync() {
  return new Sync(new ClientState(), new RowStore(), new OperationLog());
}

function mockErrorResponse(body: unknown) {
  const response = new Response(JSON.stringify(body), { status: 400, statusText: "Bad Request" });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("structured sync failures", () => {
  it("preserves out-of-sync identity for the existing recovery handler", async () => {
    mockErrorResponse({
      code: SyncErrorCode.CLIENT_STATE_OUT_OF_SYNC,
      message: "Client version is ahead of the server",
    });
    await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toMatchObject({
      name: SyncErrorCode.CLIENT_STATE_OUT_OF_SYNC,
      message: "Client version is ahead of the server",
    });
  });

  it("preserves other structured error codes and messages", async () => {
    mockErrorResponse({ code: SyncErrorCode.INVALID_OPERATION, message: "Invalid operation" });
    await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toThrow(
      "Sync error [INVALID_OPERATION]: Invalid operation",
    );
  });

  it.each([
    [{ error: "Invalid payload" }, "Sync failed (400): Invalid payload"],
    [{ message: "Missing client id" }, "Sync failed (400): Missing client id"],
    [{ error: 12, message: "Invalid payload" }, "Sync failed (400): Invalid payload"],
    [{ error: "", message: "Missing client id" }, "Sync failed (400): Missing client id"],
  ])("reads valid fallback messages from %j", async (body, expected) => {
    mockErrorResponse(body);
    await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toThrow(expected);
  });
});

describe("unexpected sync error responses", () => {
  it.each([null, false, 12, "failure", [], {}, { error: 12, message: false }])(
    "handles unexpected JSON: %j",
    async (body) => {
      mockErrorResponse(body);
      await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toThrow(
        "Sync failed (400): Unknown error",
      );
    },
  );

  it("preserves the JSON parsing failure as cause", async () => {
    const cause = new SyntaxError("Invalid JSON");
    const response = new Response("Invalid JSON", { status: 502, statusText: "Bad Gateway" });
    vi.spyOn(response, "json").mockRejectedValue(cause);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toMatchObject({
      message: "Sync failed (502): Bad Gateway",
      cause,
    });
  });

  it("uses Unknown error when a non-JSON response has no status text", async () => {
    const cause = new SyntaxError("Invalid JSON");
    const response = new Response("Invalid JSON", { status: 502 });
    vi.spyOn(response, "json").mockRejectedValue(cause);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toMatchObject({
      message: "Sync failed (502): Unknown error",
      cause,
    });
  });
});

describe("sync rejection causes", () => {
  it.each([undefined, null, 0, "offline", { reason: "offline" }])(
    "retains the original rejection: %j",
    async (cause) => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(cause);
      await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toMatchObject({
        message: `Unknown error occurred during sync: ${cause}`,
        cause,
      });
    },
  );

  it("continues preserving network failure causes", async () => {
    const cause = new TypeError("Failed to fetch");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(cause);
    await expect(createSync().sendSyncRequest(endpoint, request)).rejects.toMatchObject({
      message: "Sync network failure: Failed to fetch",
      cause,
    });
  });
});
