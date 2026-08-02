import { CRDTDatabase, newDatabase } from "@maxhill/idb-distribute";
import { authClient } from "./features/auth/auth-client";
import { UserSettingsService } from "./features/user-settings/user-settings-service";
import { reconcileDatabaseOwnership } from "./db-ownership";

const SYNC_URL = import.meta.env.VITE_SYNC_URL || "http://localhost:3001/sync";
const SYNC_INTERVAL_MS = 10_000;

export type DBInterface = CRDTDatabase<{
  shot_types: {};
  clubs: {};
  shot_log: {};
  lag_putting_games: { byCreatedAt: string[] };
  user_settings: {};
}>;

const DB_NAME = "golf";

// Store the DB instance and promise on window to ensure it's truly a singleton
declare global {
  interface Window {
    __appDB?: DBInterface;
    __appDBPromise?: Promise<DBInterface>;
    __appDBSyncIntervalId?: number;
  }
}

let authResetHookRegistered = false;

export async function get_DB(): Promise<DBInterface> {
  resetDbSingletonOnAuthChange();

  if (window.__appDB) return window.__appDB;
  if (window.__appDBPromise) return window.__appDBPromise;

  window.__appDBPromise = buildAndOpenDatabase().then((db) => withOwnershipEnforcement(db));
  const currentPromise = window.__appDBPromise;

  try {
    const db = await currentPromise;

    // This guard is to protect against the db
    // being reset while the promise is in flight.
    if (window.__appDBPromise !== currentPromise) {
      await db.close().catch((error) => {
        console.warn("Failed to close stale DB instance after auth transition", error);
      });
      return get_DB();
    }

    window.__appDB = db;

    // Start auto-sync interval (only syncs when authenticated)
    window.__appDBSyncIntervalId = window.setInterval(async () => {
      const token = await authClient.getToken();
      if (!token) return;
      try {
        await db.sync();
      } catch (error) {
        console.warn("Periodic sync failed", error);
      }
    }, SYNC_INTERVAL_MS);

    return db;
  } catch (error) {
    delete window.__appDBPromise;
    throw error;
  }
}

async function withOwnershipEnforcement(db: DBInterface): Promise<DBInterface> {
  const subjects = await authClient.getUserSubjects();
  const currentUserID = subjects?.userID ?? null;
  const settings = new UserSettingsService(db);
  const storedOwnerUserID = await settings.getDatabaseOwnerUserID();

  const result = await reconcileDatabaseOwnership({
    context: db,
    currentUserID,
    storedOwnerUserID,
    claimOwnerUserID: async (candidateDb, userID) => {
      const settings = new UserSettingsService(candidateDb);
      await settings.setDatabaseOwnerUserID(userID);
    },
    resetForNewOwner: async (candidateDb, userID) => {
      await candidateDb.close();
      await deleteLocalDatabase(DB_NAME);
      const replacementDb = await buildAndOpenDatabase();
      const replacementSettings = new UserSettingsService(replacementDb);
      await replacementSettings.setDatabaseOwnerUserID(userID);
      return replacementDb;
    },
  });

  db = result.context;
  return db;
}

function buildAndOpenDatabase(): Promise<DBInterface> {
  return newDatabase(DB_NAME)
    .addTable("shot_types", {})
    .addTable("clubs", {})
    .addTable("shot_log", {})
    .addTable("lag_putting_games", { byCreatedAt: ["createdAt"] })
    .addTable("user_settings", {})
    .withSyncRemote(SYNC_URL)
    .withSyncHeaders(async () => {
      const token = await authClient.getToken();
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    })
    .withOnUnauthorized(async () => {
      const token = await authClient.getToken();
      if (token) return true;
      authClient.logout();
      return false;
    })
    .build()
    .open();
}

async function deleteLocalDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onblocked = () => {
      reject(
        new Error(
          `Failed to reset local database '${name}': delete blocked by another open connection`,
        ),
      );
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Failed to reset local database '${name}'`));
    };
    request.onsuccess = () => {
      resolve();
    };
  });
}

function resetDbSingletonOnAuthChange(): void {
  if (authResetHookRegistered) return;
  authResetHookRegistered = true;

  authClient.onAuthChange(() => {
    void resetDBSingleton().catch((error) => {
      console.warn("Failed to reset DB singleton after auth change", error);
    });
  });
}

async function resetDBSingleton(): Promise<void> {
  if (window.__appDBSyncIntervalId !== undefined) {
    clearInterval(window.__appDBSyncIntervalId);
    delete window.__appDBSyncIntervalId;
  }

  if (window.__appDB) {
    await window.__appDB.close().catch((error) => {
      console.warn("Failed to close DB instance during auth invalidation", error);
    });
  }

  delete window.__appDB;
  delete window.__appDBPromise;
}
