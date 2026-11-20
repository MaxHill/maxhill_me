import { afterEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { newDatabase } from "./builder.ts";
import { Lifecycle } from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { Sync } from "../sync/index.ts";

describe("CRDTDatabase sync transaction liveness", () => {
  const openDbs: IDBDatabase[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();

    for (const db of openDbs.splice(0)) {
      const name = db.name;
      db.close();
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  });

  it("keeps write transaction alive by validating response hash before opening readwrite tx", async () => {
    const dbName = `sync-liveness-${crypto.randomUUID()}`;
    const lifecycle = new Lifecycle([]);
    const sync = new Sync(new ClientState(), new RowStore([]), new OperationLog());

    const db = await newDatabase(dbName, () => "")
      .withCustomStorageRepository(lifecycle)
      .withCustomSync(sync)
      .withClientId("client-1")
      .addTable("users", {})
      .build()
      .open();

    openDbs.push(lifecycle.db!);

    const response = {
      protocolVersion: 3 as const,
      clientId: "client-1",
      baseServerVersion: -1,
      latestServerVersion: 0,
      lastMutationID: 0,
      operations: [
        {
          type: "setRow" as const,
          tableName: "users",
          rowKey: "u1",
          fields: { name: "Alice" },
          dot: { clientId: "server", version: 0 },
          serverVersion: 0,
        },
      ],
      // Generated with the production OCaml response encoder and hash routine.
      responseHash: "bc7864034def63d4f1d7d86f6b57a25e1555ec08dbb6f40831a852d5bb665059",
    };

    const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...digestArguments: any[]) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return originalDigest(...(digestArguments as Parameters<SubtleCrypto["digest"]>));
    });

    await expect(db.sync(response)).resolves.toBeUndefined();
    await expect(db.table("users").get("u1")).resolves.toEqual({ _key: "u1", name: "Alice" });

    await db.close();
  });
});
