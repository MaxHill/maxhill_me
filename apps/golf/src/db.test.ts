import { expect } from "@open-wc/testing";
import { get_DB } from "./db";
import { authClient } from "./features/auth/auth-client";
import type { UserSubjects } from "./features/auth/auth-client";

describe("get_DB ownership bootstrap integration", () => {
  afterEach(async () => {
    await resetDBSingletonForTests();
    await deleteDatabase("golf-v3");
    await deleteDatabase("golf");
    localStorage.removeItem("golf-v3-legacy-retired");
  });

  it("copies acknowledged legacy rows without deleting the source or upgrading again on reopen", async () => {
    mockCurrentUser("user-a");
    await seedDrainedLegacyGolf();
    const database = await get_DB();
    expect(database.clientId).not.to.equal("old-replica");
    expect((await database.table("shot_types").get("seed"))?.name).to.equal("Putt");
    const version = await localDatabaseVersion("golf-v3");
    const identity = database.clientId;
    await resetDBSingletonForTests();
    const reopened = await get_DB();
    expect(reopened.clientId).to.equal(identity);
    expect(await localDatabaseVersion("golf-v3")).to.equal(version);
    const source = await openDatabase("golf");
    try {
      const transaction = source.transaction("clientState");
      expect(await readRequest(transaction.objectStore("clientState").get("clientId")))
        .to.equal("old-replica");
      expect(await readRequest(transaction.objectStore("clientState").get("syncProtocolVersion")))
        .to.equal(3);
    } finally {
      source.close();
    }
  });

  it("does not reimport the previous owner after a restart during replacement", async () => {
    await seedDrainedLegacyGolf();
    localStorage.setItem("golf-v3-legacy-retired", "true");
    mockCurrentUser("user-b");
    const database = await get_DB();
    expect(await database.table("shot_types").get("seed")).to.equal(undefined);
    expect((await database.table("user_settings").get("db_owner_user_id"))?.value)
      .to.equal("user-b");
    const source = await openDatabase("golf");
    expect(source.objectStoreNames.contains("rows")).to.equal(true);
    source.close();
  });

  it("resumes an authorized owner replacement when the old target still exists", async () => {
    await seedDrainedLegacyGolf();
    mockCurrentUser("user-a");
    await get_DB();
    await resetDBSingletonForTests();
    localStorage.setItem("golf-v3-legacy-retired", JSON.stringify({ replacingFor: "user-b" }));
    mockCurrentUser("user-b");
    const database = await get_DB();
    expect(await database.table("shot_types").get("seed")).to.equal(undefined);
    expect((await database.table("user_settings").get("db_owner_user_id"))?.value)
      .to.equal("user-b");
    expect(localStorage.getItem("golf-v3-legacy-retired")).to.equal("true");
  });

  it("preserves guest rows and claims ownership on first authenticated startup", async () => {
    mockCurrentUser(null);

    const db = await get_DB();
    await db.table("shot_types").setRow("seed", { name: "Putt" });

    const guestOwner = await db.table("user_settings").get("db_owner_user_id");
    expect(guestOwner).to.equal(undefined);

    await resetDBSingletonForTests();
    mockCurrentUser("user-a");

    const claimedDB = await get_DB();
    const owner = await claimedDB.table("user_settings").get("db_owner_user_id");
    const claimedShotType = await claimedDB.table("shot_types").get("seed");

    expect(owner?.value).to.equal("user-a");
    expect(claimedShotType?.name).to.equal("Putt");

    await resetDBSingletonForTests();
    mockCurrentUser("user-a");

    const sameUserDB = await get_DB();
    const shotType = await sameUserDB.table("shot_types").get("seed");
    expect(shotType?.name).to.equal("Putt");
  });

  it("keeps data stable across repeated startup for the same authenticated user", async () => {
    mockCurrentUser("user-a");
    const db = await get_DB();
    await db.table("shot_types").setRow("seed", { name: "Putt" });
    const owner = await db.table("user_settings").get("db_owner_user_id");
    expect(owner?.value).to.equal("user-a");

    await resetDBSingletonForTests();
    mockCurrentUser("user-a");

    const sameUserDB = await get_DB();
    const shotType = await sameUserDB.table("shot_types").get("seed");
    expect(shotType?.name).to.equal("Putt");
  });

  it("wipes local app database when authenticated owner changes", async () => {
    mockCurrentUser("user-a");

    const db = await get_DB();
    await db.table("shot_types").setRow("seed", { name: "Putt" });
    await resetDBSingletonForTests();

    mockCurrentUser("user-b");

    const switchedDB = await get_DB();
    const shotType = await switchedDB.table("shot_types").get("seed");
    const owner = await switchedDB.table("user_settings").get("db_owner_user_id");

    expect(shotType).to.equal(undefined);
    expect(owner?.value).to.equal("user-b");
  });

  it("does not overwrite authenticated ownership when identity is guest", async () => {
    mockCurrentUser("user-a");
    const db = await get_DB();
    await resetDBSingletonForTests();

    mockCurrentUser(null);
    const guestDB = await get_DB();

    const owner = await guestDB.table("user_settings").get("db_owner_user_id");
    expect(owner?.value).to.equal("user-a");

    await db.close();
    await guestDB.close();
  });
});

async function seedDrainedLegacyGolf(): Promise<void> {
  const request = indexedDB.open("golf", 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    const rows = database.createObjectStore("rows", { keyPath: ["table_name", "row_key"] });
    rows.put({ table_name: "shot_types", row_key: "seed", fields: {
      name: { value: "Putt", dot: { clientId: "old-replica", version: 53 } },
    } });
    rows.put({ table_name: "user_settings", row_key: "db_owner_user_id", fields: {
      value: { value: "user-a", dot: { clientId: "old-replica", version: 54 } },
    } });
    const operations = database.createObjectStore("operations", {
      keyPath: ["op.dot.clientId", "op.dot.version"],
    });
    operations.put({ op: { type: "setRow", tableName: "shot_types", rowKey: "seed",
      fields: { name: "Putt" }, dot: { clientId: "old-replica", version: 53 } }, synced: 1 });
    const state = database.createObjectStore("clientState");
    state.put(3, "syncProtocolVersion");
    state.put("old-replica", "clientId");
    state.put(54, "logicalClock");
    state.put(10, "lastSeenServerVersion");
  };
  (await readRequest(request)).close();
}

async function openDatabase(name: string): Promise<IDBDatabase> {
  return readRequest(indexedDB.open(name));
}

async function localDatabaseVersion(name: string): Promise<number> {
  const database = await openDatabase(name);
  const version = database.version;
  database.close();
  return version;
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function mockCurrentUser(userID: string | null): void {
  (authClient as unknown as { getUserSubjects: () => Promise<UserSubjects | null> }).getUserSubjects =
    async () => (userID ? { userID } : null);
  (authClient as unknown as { getToken: () => Promise<string | null> }).getToken = async () => null;
}

async function resetDBSingletonForTests(): Promise<void> {
  const db = window.__appDB;
  if (db) {
    await db.close();
  }

  if (window.__appDBSyncStops) {
    for (const handle of window.__appDBSyncStops) {
      handle.stop();
    }
  }
  if (window.__appDBSyncReset) {
    window.__appDBSyncReset();
  }

  delete window.__appDB;
  delete window.__appDBPromise;
  delete window.__appDBSyncStops;
  delete window.__appDBSyncReset;
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed deleting ${name}`));
    request.onblocked = () => reject(new Error(`Delete blocked for ${name}`));
  });
}
