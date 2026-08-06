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

  it("should notify all subscribers asynchronously", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    
    tableSubscriptions.subscribe("users", handler1);
    tableSubscriptions.subscribe("users", handler2);

    tableSubscriptions.notify("users");
    expect(handler1).toHaveBeenCalledTimes(0); // Not called yet
    
    await Promise.resolve(); // Wait for microtask
    
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith({ table: "users" });
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("should batch multiple notifications into one", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler = vi.fn();
    
    tableSubscriptions.subscribe("users", handler);

    tableSubscriptions.notify("users");
    tableSubscriptions.notify("users");
    tableSubscriptions.notify("users");

    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(1); // Batched into one call
  });

  it("should only notify subscribers of the specified table", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const usersHandler = vi.fn();
    const postsHandler = vi.fn();
    
    tableSubscriptions.subscribe("users", usersHandler);
    tableSubscriptions.subscribe("posts", postsHandler);

    tableSubscriptions.notify("users");
    await Promise.resolve();

    expect(usersHandler).toHaveBeenCalledTimes(1);
    expect(postsHandler).toHaveBeenCalledTimes(0);
  });

  it("should isolate errors in one handler from others", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    
    const handler1 = vi.fn();
    const handler2 = vi.fn(() => { throw new Error("Failed"); });
    const handler3 = vi.fn();
    
    tableSubscriptions.subscribe("users", handler1);
    tableSubscriptions.subscribe("users", handler2);
    tableSubscriptions.subscribe("users", handler3);

    tableSubscriptions.notify("users");
    await Promise.resolve();

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler3).toHaveBeenCalledTimes(1); // Still called despite handler2 error
    expect(errorSpy).toHaveBeenCalled();
    
    errorSpy.mockRestore();
  });

  it("should handle unsubscribe during notification", async () => {
    const tableSubscriptions = new TableSubscriptions();
    let unsubscribe: (() => void) | undefined;
    
    const handler = vi.fn(() => {
      unsubscribe?.(); // Unsubscribe self during notification
    });
    
    unsubscribe = tableSubscriptions.subscribe("users", handler);

    tableSubscriptions.notify("users");
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);

    // Second notification should not call handler
    tableSubscriptions.notify("users");
    await Promise.resolve();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should not throw when notifying table with no subscribers", async () => {
    const tableSubscriptions = new TableSubscriptions();
    
    expect(() => tableSubscriptions.notify("nonexistent")).not.toThrow();
    await Promise.resolve();
  });

  it("should deduplicate notifications for multiple tables", async () => {
    const tableSubscriptions = new TableSubscriptions();
    const handler = vi.fn();
    
    tableSubscriptions.subscribe("users", handler);
    tableSubscriptions.subscribe("posts", handler);

    tableSubscriptions.notify("users");
    tableSubscriptions.notify("posts");
    tableSubscriptions.notify("users"); // Duplicate
    tableSubscriptions.notify("posts"); // Duplicate

    await Promise.resolve();

    expect(handler).toHaveBeenCalledTimes(2); // Once per unique table
  });
});
