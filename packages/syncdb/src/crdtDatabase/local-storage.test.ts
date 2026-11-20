import { afterEach, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { newDatabase } from "./builder.ts";
import { promisifyIDBRequest } from "../utils.ts";

afterEach(() => vi.restoreAllMocks());

it("uses a separate local store while uploading to the same remote partition", async () => {
  const remoteName = `partition-${crypto.randomUUID()}`;
  const localName = `local-${crypto.randomUUID()}`;
  const build = () => newDatabase(remoteName).withLocalDatabaseName(localName)
    .withSyncRemote("https://sync.invalid/v3/sync").addTable("users", {}).build().open();
  let database = await build();
  try {
    const identity = database.clientId;
    await database.table("users").setRow("u1", { name: "Preserved" });
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(database.sync()).rejects.toThrow("offline");
    const request = JSON.parse(String(network.mock.calls[0][1]?.body));
    expect(request.dbName).toBe(remoteName);
    expect(request.mutations[0].id).toBe(1);
    await database.close();
    database = await build();
    expect(database.clientId).toBe(identity);
    expect(await database.table("users").get("u1"))
      .toEqual({ _key: "u1", name: "Preserved" });
    const stores = await indexedDB.databases();
    expect(stores.some((store) => store.name === localName)).toBe(true);
    expect(stores.some((store) => store.name === remoteName)).toBe(false);
  } finally {
    await database.close();
    await promisifyIDBRequest(indexedDB.deleteDatabase(localName));
  }
});
