import { afterEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { newDatabase } from "./builder.ts";
import { Lifecycle } from "../indexeddb/lifecycle.ts";
import { ClientState } from "../indexeddb/clientState.ts";
import { RowStore } from "../indexeddb/rowStore.ts";
import { OperationLog } from "../indexeddb/operationLog.ts";
import { Sync } from "../sync/index.ts";

class HashBypassSync extends Sync {
  override async validateResponseHash(): Promise<boolean> {
    return true;
  }
}

describe("CRDTDatabase sync notifications", () => {
  const opened: Array<{ name: string; db: any }> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const { name, db } of opened.splice(0)) {
      await db.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  });

  it("does not notify remote subscribers when stale response operations are ignored", async () => {
    const lifecycle = new Lifecycle();
    const sync = new HashBypassSync(new ClientState(), new RowStore(), new OperationLog());
    const dbName = `sync-notify-${crypto.randomUUID()}`;
    const db = await newDatabase(dbName)
      .withCustomStorageRepository(lifecycle)
      .withCustomSync(sync)
      .withClientId("c1")
      .addTable("users", {})
      .build()
      .open();

    opened.push({ name: dbName, db });

    await db.table("users").setRow("u1", { name: "local" });
    const notifications: unknown[] = [];
    db.subscribe((event) => {
      notifications.push(event);
    }, "remote");

    await db.sync({
      protocolVersion: 3,
      clientId: "c1",
      baseServerVersion: 5,
      latestServerVersion: 6,
      lastMutationID: 1,
      responseHash: "ignored",
      operations: [
        {
          type: "setRow",
          tableName: "users",
          rowKey: "remote",
          fields: { name: "should-not-apply" },
          dot: { clientId: "server", version: 10 },
          serverVersion: 6,
        },
      ],
    });

    await Promise.resolve();
    expect(notifications).toHaveLength(0);
    await expect(db.table("users").get("remote")).resolves.toBeUndefined();
  });
});
