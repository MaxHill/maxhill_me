/**
 * Subscribe to server upstream-change wake-ups (SSE) and invoke a callback.
 * Uses fetch + Bearer auth (EventSource cannot set Authorization).
 * See docs/adr/0004-sse-upstream-change-wakeups.md.
 */

export type UpstreamSubscribeOptions = {
  /** e.g. http://localhost:3001/subscribe/golf?clientId=… */
  url: string;
  getToken: () => Promise<string | null>;
  onUpstreamChange: () => void | Promise<void>;
  /**
   * Called after a stream opens and after it ends (before reconnect).
   * Use for a catch-up sync — missed wake-ups are not replayed by the server.
   */
  onCatchUp?: () => void | Promise<void>;
  /**
   * After HTTP 401/403: refresh credentials and return true to retry once,
   * or false to stop the subscription (e.g. after logout).
   */
  onUnauthorized?: () => Promise<boolean>;
  signal: AbortSignal;
  /** Delay before reconnect after a drop (ms). */
  reconnectDelayMs?: number;
  /** Delay while waiting for an auth token (ms). */
  tokenRetryDelayMs?: number;
  /** Delay after HTTP 429 capacity (ms). */
  capacityRetryDelayMs?: number;
};

export class SubscribeHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SubscribeHttpError";
    this.status = status;
  }
}

/** Build subscribe URL from the existing POST /sync base URL. */
export function subscribeUrlFromSyncUrl(
  syncUrl: string,
  dbName: string,
  clientId: string,
): string {
  const base = syncUrl.replace(/\/sync\/?$/, "");
  const url = new URL(`${base}/subscribe/${encodeURIComponent(dbName)}`);
  url.searchParams.set("clientId", clientId);
  return url.toString();
}

/**
 * Run until `signal` aborts. Reconnects on stream end / network error.
 * If there is no token yet, waits and retries (login may happen later).
 */
export async function runUpstreamSubscription(
  options: UpstreamSubscribeOptions,
): Promise<void> {
  const reconnectDelayMs = options.reconnectDelayMs ?? 2_000;
  const tokenRetryDelayMs = options.tokenRetryDelayMs ?? 3_000;
  const capacityRetryDelayMs = options.capacityRetryDelayMs ?? 30_000;

  while (!options.signal.aborted) {
    const token = await options.getToken();
    if (!token) {
      await sleep(tokenRetryDelayMs, options.signal);
      continue;
    }

    try {
      await openUpstreamStream({
        url: options.url,
        token,
        signal: options.signal,
        onUpstreamChange: options.onUpstreamChange,
        onCatchUp: options.onCatchUp,
      });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }

      if (error instanceof SubscribeHttpError) {
        if (error.status === 401 || error.status === 403) {
          console.warn("Upstream subscribe unauthorized", error.message);
          const shouldRetry = options.onUnauthorized
            ? await options.onUnauthorized()
            : false;
          if (!shouldRetry || options.signal.aborted) {
            return;
          }
          // Immediate retry with refreshed token — no catch-up until open succeeds.
          continue;
        }

        if (error.status === 429) {
          console.warn("Upstream subscribe at capacity; backing off", error.message);
          if (options.onCatchUp) {
            try {
              await options.onCatchUp();
            } catch (catchUpError) {
              console.warn("Upstream catch-up sync failed", catchUpError);
            }
          }
          await sleep(capacityRetryDelayMs, options.signal);
          continue;
        }
      }

      console.warn("Upstream subscribe failed; will retry", error);
    }

    // Stream dropped or non-auth failure — pull once before waiting to reconnect.
    if (!options.signal.aborted && options.onCatchUp) {
      try {
        await options.onCatchUp();
      } catch (error) {
        console.warn("Upstream catch-up sync failed", error);
      }
    }

    if (options.signal.aborted) {
      return;
    }
    await sleep(reconnectDelayMs, options.signal);
  }
}

async function openUpstreamStream(request: {
  url: string;
  token: string;
  signal: AbortSignal;
  onUpstreamChange: () => void | Promise<void>;
  onCatchUp?: () => void | Promise<void>;
}): Promise<void> {
  const response = await fetch(request.url, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${request.token}`,
    },
    // Avoid Firefox (and intermediaries) caching/buffering the stream oddly.
    cache: "no-store",
    signal: request.signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new SubscribeHttpError(
      response.status,
      `subscribe failed: ${response.status}${body ? ` ${body}` : ""}`,
    );
  }
  if (!response.body) {
    throw new Error("subscribe failed: empty body");
  }

  // Catch up as soon as the stream is live (missed events while disconnected).
  if (request.onCatchUp) {
    await request.onCatchUp();
  }

  // Read bytes + decode manually. pipeThrough(TextDecoderStream) has been
  // flaky cross-origin in some Firefox builds; this path is more reliable.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let splitAt = buffer.indexOf("\n\n");
      while (splitAt >= 0) {
        const frame = buffer.slice(0, splitAt);
        buffer = buffer.slice(splitAt + 2);
        const eventName = parseSseEventName(frame);
        if (eventName === "upstreamChange") {
          // Do not await the handler.
          // If we wait for sync, this loop stops reading frames.
          // Later wake-ups then queue and each one starts another full sync.
          // Fire the handler and keep reading. The sync runner merges overlap.
          void request.onUpstreamChange();
        }
        splitAt = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Exposed for tests. Returns the SSE `event:` field, defaulting to `message`. */
export function parseSseEventName(frame: string): string {
  let eventName = "message";
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith(":") || line === "") {
      continue;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    }
  }
  return eventName;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
