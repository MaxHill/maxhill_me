import { CRDTDatabase, newDatabase } from "@maxhill/syncdb";
import { authClient } from "./features/auth/auth-client";
import { UserSettingsService } from "./features/user-settings/user-settings-service";
import { reconcileDatabaseOwnership } from "./db-ownership";
import {
  createRequestSync,
  onLocalWrite,
  onSchedule,
  onUpstreamChange,
  type StopHandle,
} from "./sync-strategies";

const SYNC_URL = import.meta.env.VITE_SYNC_URL || "http://localhost:3001/sync";
/** Safety-net pull when SSE is quiet. */
const SYNC_INTERVAL_MS = 120_000;
/** Trailing debounce after local writes before pushing. */
const LOCAL_SYNC_DEBOUNCE_MS = 1_000;

export type DBInterface = CRDTDatabase<{
  shot_types: {};
  clubs: {};
  shot_log: {};
  lag_putting_games: { byCreatedAt: string[] };
  user_settings: {};
  golf_rounds: { byStartedAt: string[] };
  golf_round_holes: {
    byRoundId: string[];
    byRoundAndHole: string[];
  };
}>;

const DB_NAME = "golf";

// Store the DB instance and promise on window to ensure it's truly a singleton
declare global {
  interface Window {
    __appDB?: DBInterface;
    __appDBPromise?: Promise<DBInterface>;
    __appDBSyncStops?: StopHandle[];
    __appDBSyncReset?: () => void;
  }
}

let authResetHookRegistered = false;

export async function get_DB(): Promise<DBInterface> {
  resetDbSingletonOnAuthChange();

  if (window.__appDB) {
    return window.__appDB;
  }
  if (window.__appDBPromise) {
    return window.__appDBPromise;
  }

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
    startSyncStrategies(db);

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
      const ownerSettings = new UserSettingsService(candidateDb);
      await ownerSettings.setDatabaseOwnerUserID(userID);
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
    .addTable("golf_rounds", { byStartedAt: ["startedAt"] })
    .addTable("golf_round_holes", {
      byRoundId: ["roundId"],
      byRoundAndHole: ["roundId", "holeNumber"],
    })
    .withSyncRemote(SYNC_URL)
    .withSyncHeaders(async () => {
      const token = await authClient.getToken();
      if (!token) {
        return {};
      }
      return { Authorization: `Bearer ${token}` };
    })
    .withOnUnauthorized(async () => {
      const token = await authClient.getToken();
      if (token) {
        return true;
      }
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
  if (authResetHookRegistered) {
    return;
  }
  authResetHookRegistered = true;

  authClient.onAuthChange((authenticated) => {
    void (async () => {
      try {
        await resetDBSingleton();
        // Login used to only tear down strategies and never reopen — no sync
        // until a full navigation. Re-open when authenticated so triggers restart.
        if (authenticated) {
          await get_DB();
        }
      } catch (error) {
        console.warn("Failed to reset DB singleton after auth change", error);
      }
    })();
  });
}

function startSyncStrategies(db: DBInterface): void {
  stopSyncStrategies();

  const { requestSync, reset } = createRequestSync({
    db,
    getToken: () => authClient.getToken(),
  });
  window.__appDBSyncReset = reset;

  window.__appDBSyncStops = [
    onSchedule({ requestSync, intervalMs: SYNC_INTERVAL_MS }),
    onLocalWrite({ db, requestSync, debounceMs: LOCAL_SYNC_DEBOUNCE_MS }),
    onUpstreamChange({
      db,
      requestSync,
      syncUrl: SYNC_URL,
      dbName: DB_NAME,
      getToken: () => authClient.getToken(),
      onUnauthorized: async () => {
        // Match POST /sync: try a forced refresh once, else log out.
        const token = await authClient.getToken({ forceRefresh: true });
        if (token) {
          return true;
        }
        await authClient.logout();
        return false;
      },
    }),
  ];
}

function stopSyncStrategies(): void {
  if (window.__appDBSyncStops) {
    for (const handle of window.__appDBSyncStops) {
      handle.stop();
    }
    delete window.__appDBSyncStops;
  }
  if (window.__appDBSyncReset) {
    window.__appDBSyncReset();
    delete window.__appDBSyncReset;
  }
}

async function resetDBSingleton(): Promise<void> {
  stopSyncStrategies();

  if (window.__appDB) {
    await window.__appDB.close().catch((error) => {
      console.warn("Failed to close DB instance during auth invalidation", error);
    });
  }

  delete window.__appDB;
  delete window.__appDBPromise;
}
