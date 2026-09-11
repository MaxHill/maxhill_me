import { expect } from "@open-wc/testing";
import {
  parseSseEventName,
  runUpstreamSubscription,
  SubscribeHttpError,
  subscribeUrlFromSyncUrl,
} from "./upstream-subscribe";

describe("upstream-subscribe helpers", () => {
  it("builds subscribe URL from sync URL", () => {
    expect(subscribeUrlFromSyncUrl("http://localhost:3001/sync", "golf", "cid-1")).to.equal(
      "http://localhost:3001/subscribe/golf?clientId=cid-1",
    );
    expect(subscribeUrlFromSyncUrl("https://sync.example/sync/", "golf", "a b")).to.equal(
      "https://sync.example/subscribe/golf?clientId=a+b",
    );
  });

  it("parses named SSE events and ignores comments", () => {
    expect(parseSseEventName("event: upstreamChange\ndata: {}")).to.equal("upstreamChange");
    expect(parseSseEventName(": keepalive\n")).to.equal("message");
    expect(parseSseEventName("data: {}\n")).to.equal("message");
  });
});

describe("runUpstreamSubscription", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("dispatches upstreamChange and catch-up on open", async () => {
    const wakeUps: string[] = [];
    const catchUps: string[] = [];
    const abort = new AbortController();

    globalThis.fetch = (async () => {
      const body = sseBody([
        "event: upstreamChange\ndata: {}\n\n",
        ": keepalive\n\n",
        "event: upstreamChange\ndata: {}\n\n",
      ]);
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    const done = runUpstreamSubscription({
      url: "http://example.test/subscribe/golf?clientId=c1",
      getToken: async () => "tok",
      onUpstreamChange: async () => {
        wakeUps.push("wake");
        if (wakeUps.length >= 2) {
          abort.abort();
        }
      },
      onCatchUp: async () => {
        catchUps.push("catch");
      },
      signal: abort.signal,
      reconnectDelayMs: 10,
    });

    await done;
    expect(catchUps.length).to.be.at.least(1);
    expect(wakeUps.length).to.be.at.least(2);
  });

  it("calls onUnauthorized on 401 and stops when it returns false", async () => {
    let unauthorizedCalls = 0;
    const abort = new AbortController();

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "nope" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    await runUpstreamSubscription({
      url: "http://example.test/subscribe/golf?clientId=c1",
      getToken: async () => "tok",
      onUpstreamChange: async () => {},
      onUnauthorized: async () => {
        unauthorizedCalls += 1;
        return false;
      },
      signal: abort.signal,
      reconnectDelayMs: 10,
    });

    expect(unauthorizedCalls).to.equal(1);
  });

  it("backs off on 429 without tight retry loop", async () => {
    let fetchCount = 0;
    const abort = new AbortController();
    const started = Date.now();

    globalThis.fetch = (async () => {
      fetchCount += 1;
      if (fetchCount >= 2) {
        abort.abort();
      }
      return new Response(JSON.stringify({ error: "too many subscribers" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await runUpstreamSubscription({
      url: "http://example.test/subscribe/golf?clientId=c1",
      getToken: async () => "tok",
      onUpstreamChange: async () => {},
      signal: abort.signal,
      reconnectDelayMs: 5,
      capacityRetryDelayMs: 40,
    });

    const elapsed = Date.now() - started;
    expect(fetchCount).to.be.at.least(2);
    expect(elapsed).to.be.at.least(35);
  });

  it("waits for a token instead of exiting", async () => {
    let tokenCalls = 0;
    const abort = new AbortController();

    globalThis.fetch = (async () => {
      abort.abort();
      return new Response(sseBody([]), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    await runUpstreamSubscription({
      url: "http://example.test/subscribe/golf?clientId=c1",
      getToken: async () => {
        tokenCalls += 1;
        return tokenCalls >= 2 ? "tok" : null;
      },
      onUpstreamChange: async () => {},
      signal: abort.signal,
      tokenRetryDelayMs: 15,
      reconnectDelayMs: 5,
    });

    expect(tokenCalls).to.be.at.least(2);
  });

  it("exposes status on SubscribeHttpError", () => {
    const error = new SubscribeHttpError(429, "full");
    expect(error.status).to.equal(429);
    expect(error.name).to.equal("SubscribeHttpError");
  });
});

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= frames.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(frames[index]));
      index += 1;
    },
  });
}
