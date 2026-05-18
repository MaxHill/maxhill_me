import { CRDTDatabase, newDatabase } from "@maxhill/idb-distribute";
import { authClient } from "./features/auth/auth-client";

const SYNC_URL = import.meta.env.VITE_SYNC_URL || "http://localhost:3001/sync";
const SYNC_INTERVAL_MS = 10_000;

export type DBInterface = CRDTDatabase<{
  shot_types: {};
  clubs: {};
  shot_log: {};
  lag_putting_games: { byCreatedAt: string[] };
  user_settings: {};
}>;

// Store the DB instance and promise on window to ensure it's truly a singleton
declare global {
  interface Window {
    __appDB?: DBInterface;
    __appDBPromise?: Promise<DBInterface>;
  }
}

export async function get_DB(): Promise<DBInterface> {
  if (window.__appDB) return window.__appDB;
  if (window.__appDBPromise) return window.__appDBPromise;

  window.__appDBPromise = newDatabase("user::testdb")
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

  const db = await window.__appDBPromise;
  window.__appDB = db;

  // Start auto-sync interval (only syncs when authenticated)
  setInterval(async () => {
    const token = await authClient.getToken();
    if (!token) {
      return;
    }
    try {
      await db.sync();
    } catch (e) {
    }
  }, SYNC_INTERVAL_MS);

  return db;
}
