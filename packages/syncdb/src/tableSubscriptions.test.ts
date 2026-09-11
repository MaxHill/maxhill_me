import { describe, it, expect, vi } from "vitest";
import { TableSubscriptions } from "./tableSubscriptions";

describe("TableSubscriptions", () => {
  it("should subscribe and unsubscribe using cleanup function", () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler = vi.fn();

    const unsubscribe = tableSubscriptions.subscribe("users", handler);
    expect(tableSubscriptions.subscriptions.get("users")?.length).toBe(1);

    unsubscribe();
    expect(tableSubscriptions.subscriptions.get("users")).toBeUndefined();
  });

  it("should prevent duplicate subscriptions", () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    tableSubscriptions.subscribe("users", handler);
    tableSubscriptions.subscribe("users", handler);

    expect(tableSubscriptions.subscriptions.get("users")?.length).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith('Handler already subscribed to table "users"');

    warnSpy.mockRestore();
  });

  it("should clean up empty arrays after last unsubscribe", () => {
    const tableSubscriptions = new TableSubscriptions();
    const unsubscribe1 = tableSubscriptions.subscribe("users", vi.fn());
    const unsubscribe2 = tableSubscriptions.subscribe("users", vi.fn());

    unsubscribe1();
    expect(tableSubscriptions.subscriptions.get("users")?.length).toBe(1);

    unsubscribe2();
    expect(tableSubscriptions.subscriptions.get("users")).toBeUndefined();
  });

  it("should notify all subscribers asynchronously with source", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    tableSubscriptions.subscribe("users", handler1);
    tableSubscriptions.subscribe("users", handler2);

    tableSubscriptions.notify("users", "local");
    expect(handler1).toHaveBeenCalledTimes(0);

    await Promise.resolve();

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith({ table: "users", source: "local" });
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("should batch multiple notifications of the same table+source into one", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler = vi.fn();

    tableSubscriptions.subscribe("users", handler);

    tableSubscriptions.notify("users", "local");
    tableSubscriptions.notify("users", "local");
    tableSubscriptions.notify("users", "local");

    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should deliver local and remote as separate events for the same table", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler = vi.fn();

    tableSubscriptions.subscribe("users", handler);

    tableSubscriptions.notify("users", "local");
    tableSubscriptions.notify("users", "remote");

    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith({ table: "users", source: "local" });
    expect(handler).toHaveBeenCalledWith({ table: "users", source: "remote" });
  });

  it("should only notify subscribers of the specified table", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const usersHandler = vi.fn();
    const postsHandler = vi.fn();

    tableSubscriptions.subscribe("users", usersHandler);
    tableSubscriptions.subscribe("posts", postsHandler);

    tableSubscriptions.notify("users", "local");
    await Promise.resolve();

    expect(usersHandler).toHaveBeenCalledTimes(1);
    expect(postsHandler).toHaveBeenCalledTimes(0);
  });

  it("should filter table subscribers by source", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const localOnly = vi.fn();
    const remoteOnly = vi.fn();
    const all = vi.fn();

    tableSubscriptions.subscribe("users", localOnly, "local");
    tableSubscriptions.subscribe("users", remoteOnly, "remote");
    tableSubscriptions.subscribe("users", all, "all");

    tableSubscriptions.notify("users", "local");
    await Promise.resolve();

    expect(localOnly).toHaveBeenCalledTimes(1);
    expect(remoteOnly).toHaveBeenCalledTimes(0);
    expect(all).toHaveBeenCalledTimes(1);

    tableSubscriptions.notify("users", "remote");
    await Promise.resolve();

    expect(localOnly).toHaveBeenCalledTimes(1);
    expect(remoteOnly).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(2);
  });

  it("should notify database-level subscribers for any table", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const dbHandler = vi.fn();

    tableSubscriptions.subscribeDatabase(dbHandler);

    tableSubscriptions.notify("users", "local");
    tableSubscriptions.notify("posts", "remote");
    await Promise.resolve();

    expect(dbHandler).toHaveBeenCalledTimes(2);
    expect(dbHandler).toHaveBeenCalledWith({ table: "users", source: "local" });
    expect(dbHandler).toHaveBeenCalledWith({ table: "posts", source: "remote" });
  });

  it("should filter database-level subscribers by source", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const localOnly = vi.fn();

    tableSubscriptions.subscribeDatabase(localOnly, "local");

    tableSubscriptions.notify("users", "remote");
    tableSubscriptions.notify("users", "local");
    await Promise.resolve();

    expect(localOnly).toHaveBeenCalledTimes(1);
    expect(localOnly).toHaveBeenCalledWith({ table: "users", source: "local" });
  });

  it("should isolate errors in one handler from others", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const handler1 = vi.fn();
    const handler2 = vi.fn(() => {
      throw new Error("Failed");
    });
    const handler3 = vi.fn();

    tableSubscriptions.subscribe("users", handler1);
    tableSubscriptions.subscribe("users", handler2);
    tableSubscriptions.subscribe("users", handler3);

    tableSubscriptions.notify("users", "local");
    await Promise.resolve();

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler3).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("should handle unsubscribe during notification", async () => {
    const tableSubscriptions = new TableSubscriptions();
    let unsubscribe: (() => void) | undefined;

    const handler = vi.fn(() => {
      unsubscribe?.();
    });

    unsubscribe = tableSubscriptions.subscribe("users", handler);

    tableSubscriptions.notify("users", "local");
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    tableSubscriptions.notify("users", "local");
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should not throw when notifying table with no subscribers", async () => {
    const tableSubscriptions = new TableSubscriptions();

    expect(() => tableSubscriptions.notify("nonexistent", "local")).not.toThrow();
    await Promise.resolve();
  });

  it("should deduplicate notifications for multiple tables", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler = vi.fn();

    tableSubscriptions.subscribe("users", handler);
    tableSubscriptions.subscribe("posts", handler);

    tableSubscriptions.notify("users", "local");
    tableSubscriptions.notify("posts", "local");
    tableSubscriptions.notify("users", "local");
    tableSubscriptions.notify("posts", "local");

    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
