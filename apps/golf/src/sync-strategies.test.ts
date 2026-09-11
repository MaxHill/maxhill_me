import { expect } from "@open-wc/testing";
import { createRequestSync, onLocalWrite, onSchedule } from "./sync-strategies";

describe("onSchedule", () => {
  it("fires startup kick then interval syncs", async () => {
    const calls: string[] = [];
    const handle = onSchedule({
      intervalMs: 30,
      startupDelayMs: 5,
      requestSync: async (reason) => {
        calls.push(reason);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    handle.stop();

    expect(calls[0]).to.equal("schedule-startup");
    expect(calls.some((reason) => reason === "schedule")).to.equal(true);
  });
});

describe("onLocalWrite", () => {
  it("debounces bursts into one sync", async () => {
    const calls: string[] = [];
    const handlers: Array<() => void> = [];

    const db = {
      clientId: "c1",
      sync: async () => {},
      subscribe: (handler: () => void, source?: string) => {
        expect(source).to.equal("local");
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index >= 0) {
            handlers.splice(index, 1);
          }
        };
      },
    };

    const handle = onLocalWrite({
      db: db as never,
      debounceMs: 30,
      requestSync: async (reason) => {
        calls.push(reason);
      },
    });

    handlers[0]?.();
    handlers[0]?.();
    handlers[0]?.();

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(calls.length).to.equal(0);

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls).to.deep.equal(["local-write"]);

    handle.stop();
  });
});

describe("createRequestSync", () => {
  it("coalesces concurrent callers", async () => {
    let syncCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { requestSync } = createRequestSync({
      getToken: async () => "token",
      db: {
        clientId: "c1",
        subscribe: () => () => {},
        sync: async () => {
          syncCount += 1;
          await gate;
        },
      },
    });

    const first = requestSync("a");
    const second = requestSync("b");
    release();
    await Promise.all([first, second]);

    // First run + one trailing retry from the concurrent call
    expect(syncCount).to.equal(2);
  });

  it("skips when there is no token", async () => {
    let syncCount = 0;
    const { requestSync } = createRequestSync({
      getToken: async () => null,
      db: {
        clientId: "c1",
        subscribe: () => () => {},
        sync: async () => {
          syncCount += 1;
        },
      },
    });

    await requestSync("x");
    expect(syncCount).to.equal(0);
  });
});
