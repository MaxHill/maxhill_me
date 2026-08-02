import { expect } from "@open-wc/testing";
import { get_DB } from "./db";
import { authClient } from "./features/auth/auth-client";
import type { UserSubjects } from "./features/auth/auth-client";

describe("get_DB ownership bootstrap integration", () => {
  afterEach(async () => {
    await resetDBSingletonForTests();
    await deleteDatabase("golf");
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

  if (window.__appDBSyncIntervalId !== undefined) {
    clearInterval(window.__appDBSyncIntervalId);
  }

  delete window.__appDB;
  delete window.__appDBPromise;
  delete window.__appDBSyncIntervalId;
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Failed deleting ${name}`));
    request.onblocked = () => reject(new Error(`Delete blocked for ${name}`));
  });
}
