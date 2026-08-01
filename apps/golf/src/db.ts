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

let authInvalidationHookRegistered = false;
let pendingInvalidation: Promise<void> | null = null;
let dbSessionVersion = 0;

export async function get_DB(): Promise<DBInterface> {
  ensureAuthChangeInvalidatesDBSingleton();
  await waitForPendingInvalidation();

  if (window.__appDB) return window.__appDB;
  if (window.__appDBPromise) return window.__appDBPromise;

  window.__appDBPromise = openDBWithOwnershipEnforcement();
  const promiseVersion = dbSessionVersion;
  const currentPromise = window.__appDBPromise;

  try {
    const db = await currentPromise;

    if (promiseVersion !== dbSessionVersion) {
      await db.close().catch((error) => {
        console.warn("Failed to close stale DB instance after auth transition", error);
      });
      if (window.__appDBPromise === currentPromise) {
        delete window.__appDBPromise;
      }
      return get_DB();
    }

    window.__appDB = db;

    // Start auto-sync interval (only syncs when authenticated)
    window.__appDBSyncIntervalId = window.setInterval(async () => {
      const token = await authClient.getToken();
      if (!token) {
        return;
      }
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

async function openDBWithOwnershipEnforcement(): Promise<DBInterface> {
  let db = await buildAndOpenDatabase();
  const currentUserID = await authClient.getCurrentUserID();

  const result = await reconcileDatabaseOwnership({
    context: db,
    currentUserID,
    getStoredOwnerUserID: async (candidateDb) => {
      const settings = new UserSettingsService(candidateDb);
      return settings.getDatabaseOwnerUserID();
    },
    claimOwnerUserID: async (candidateDb, userID) => {
      const settings = new UserSettingsService(candidateDb);
      await settings.setDatabaseOwnerUserID(userID);
    },
    resetForNewOwner: async (candidateDb, userID) => {
      await candidateDb.close();
      await resetLocalDatabase(DB_NAME);
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

async function resetLocalDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);

    request.onblocked = () => {
      reject(new Error(`Failed to reset local database '${name}': delete blocked by another open connection`));
    };
    request.onerror = () => {
      reject(request.error ?? new Error(`Failed to reset local database '${name}'`));
    };
    request.onsuccess = () => {
      resolve();
    };
  });
}

function ensureAuthChangeInvalidatesDBSingleton(): void {
  if (authInvalidationHookRegistered) return;
  authInvalidationHookRegistered = true;

  authClient.onAuthChange(() => {
    pendingInvalidation = invalidateDBSingleton()
      .catch((error) => {
        console.warn("Failed to invalidate DB singleton after auth change", error);
      })
      .finally(() => {
        pendingInvalidation = null;
      });
  });
}

async function waitForPendingInvalidation(): Promise<void> {
  if (pendingInvalidation) {
    await pendingInvalidation;
  }
}

async function invalidateDBSingleton(): Promise<void> {
  dbSessionVersion += 1;

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
