import type { CRDTDatabase } from "@maxhill/syncdb";
import {
  runUpstreamSubscription,
  subscribeUrlFromSyncUrl,
} from "./upstream-subscribe";

/** Anything we can schedule sync against (golf DB shape is enough). */
export type SyncTarget = Pick<CRDTDatabase, "sync" | "clientId" | "subscribe">;

export type RequestSync = (reason: string) => Promise<void>;

export type StopHandle = {
  stop: () => void;
};

/**
 * Single-flight sync: concurrent callers set a trailing retry flag.
 * Skips when there is no auth token.
 */
export function createRequestSync(options: {
  db: SyncTarget;
  getToken: () => Promise<string | null>;
}): { requestSync: RequestSync; reset: () => void } {
  let syncInFlight = false;
  let syncAgain = false;

  const requestSync: RequestSync = async (reason) => {
    const token = await options.getToken();
    if (!token) {
      console.debug(`[sync] skip (${reason}): no token`);
      return;
    }

    if (syncInFlight) {
      syncAgain = true;
      console.debug(`[sync] coalesce (${reason}): in flight`);
      return;
    }

    syncInFlight = true;
    try {
      do {
        syncAgain = false;
        try {
          console.debug(`[sync] run (${reason})`);
          await options.db.sync();
          console.debug(`[sync] ok (${reason})`);
        } catch (error) {
          console.warn(`Sync failed (${reason})`, error);
        }
      } while (syncAgain);
    } finally {
      syncInFlight = false;
    }
  };

  return {
    requestSync,
    reset: () => {
      syncInFlight = false;
      syncAgain = false;
    },
  };
}

/**
 * Periodic safety-net sync (e.g. every 2 minutes).
 */
export function onSchedule(options: {
  requestSync: RequestSync;
  intervalMs: number;
  /** Delay before the first kick (race hedge while auth/DB settle). Default 500. */
  startupDelayMs?: number;
}): StopHandle {
  const startupDelayMs = options.startupDelayMs ?? 500;
  // Kick once soon so a loaded session is not quiet until the first interval.
  const startupId = window.setTimeout(() => {
    void options.requestSync("schedule-startup");
  }, startupDelayMs);

  const intervalId = window.setInterval(() => {
    void options.requestSync("schedule");
  }, options.intervalMs);

  return {
    stop: () => {
      clearTimeout(startupId);
      clearInterval(intervalId);
    },
  };
}

/**
 * Local writes: trailing debounce — each write pushes sync `debounceMs` out.
 * Burst of edits → one sync after the last write + quiet period.
 */
export function onLocalWrite(options: {
  db: SyncTarget;
  requestSync: RequestSync;
  debounceMs: number;
}): StopHandle {
  let timeoutId: number | undefined;

  const unsubscribe = options.db.subscribe((event) => {
    console.debug("[sync] local change", event);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      timeoutId = undefined;
      void options.requestSync("local-write");
    }, options.debounceMs);
  }, "local");

  return {
    stop: () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      unsubscribe();
    },
  };
}

/**
 * Server upstream-change SSE wake-ups → immediate sync request.
 * (Wake-up only — not the same as ChangeSource "remote".)
 */
export function onUpstreamChange(options: {
  db: SyncTarget;
  requestSync: RequestSync;
  syncUrl: string;
  dbName: string;
  getToken: () => Promise<string | null>;
  /** After HTTP 401/403 on subscribe — refresh or log out. */
  onUnauthorized?: () => Promise<boolean>;
}): StopHandle {
  const abort = new AbortController();
  const url = subscribeUrlFromSyncUrl(
    options.syncUrl,
    options.dbName,
    options.db.clientId,
  );

  console.debug("[sync] upstream subscribe", url);

  void runUpstreamSubscription({
    url,
    getToken: options.getToken,
    onUpstreamChange: () => {
      console.debug("[sync] upstream change wake-up");
      // Do not return the requestSync promise. The SSE reader must not wait on sync.
      void options.requestSync("upstream-change");
    },
    onCatchUp: () => {
      console.debug("[sync] upstream catch-up");
      // Same as wake-up: catch-up must not block open/reconnect control flow on sync.
      void options.requestSync("upstream-reconnect");
    },
    onUnauthorized: options.onUnauthorized,
    signal: abort.signal,
  }).catch((error) => {
    if (!abort.signal.aborted) {
      console.warn("Upstream subscription stopped", error);
    }
  });

  return {
    stop: () => {
      abort.abort();
    },
  };
}
