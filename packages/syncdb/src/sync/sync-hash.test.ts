import { describe, expect, it } from "vitest";
import { Sync, type SyncResponse } from "./index.ts";

describe("Sync response hash compatibility", () => {
  it("matches the server hash for a checkpoint with tombstone state", async () => {
    const response: SyncResponse = {
      baseServerVersion: 0,
      latestServerVersion: 8,
      operations: [
        {
          type: "checkpointRow",
          tableName: "todos",
          rowKey: "r1",
          dot: { clientId: "server", version: 9 },
          checkpointSeenServerVersion: 7,
          fields: {
            title: {
              value: "Hi",
              dot: { clientId: "client-1", version: 2 },
            },
          },
          tombstone: {
            dot: { clientId: "deleter", version: 3 },
            versionVector: { "client-1": 2 },
          },
          serverVersion: 8,
        },
      ],
      syncedOperations: [],
      responseHash: "0a330e88ebc6f8da31563f3a6b46f0c32f2fed49dea522ec9dba1f4bd97af11a",
    };
    const sync = new Sync({} as any, {} as any, {} as any);

    await expect(sync.validateResponseHash(response)).resolves.toBe(true);
  });
});
