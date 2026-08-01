import { expect } from "@open-wc/testing";
import { AuthClient } from "./auth-client";

describe("AuthClient", () => {
  const initialPath = window.location.pathname + window.location.search + window.location.hash;

  afterEach(async () => {
    window.history.replaceState({}, "", initialPath);
    sessionStorage.clear();
    await clearAuthStore();
  });

  it("handleCallback exchanges code and stores access token", async () => {
    const client = new AuthClient({
      exchange: async () => ({
        err: false,
        tokens: { access: "a1", refresh: "r1", expiresIn: 3600 },
      }),
    } as any);

    sessionStorage.setItem("auth_challenge", JSON.stringify({ state: "s", verifier: "v" }));
    window.history.replaceState({}, "", "/callback?code=abc&state=s");

    await client.handleCallback();

    const token = await readStoredValue("access_token");
    expect(token).to.equal("a1");
    expect(sessionStorage.getItem("auth_challenge")).to.equal(null);
  });

  it("getCurrentUserID reads userID from verified subject", async () => {
    await seedTokens({ access: "a1", refresh: "r1", expiresIn: 3600 });
    const client = new AuthClient({
      refresh: async () => ({ err: false }),
      verify: async () => ({
        subject: { type: "user", properties: { userID: "user-123" } },
      }),
    } as any);

    const userID = await client.getCurrentUserID();
    expect(userID).to.equal("user-123");
  });

  it("getToken returns null and emits unauthenticated when refresh fails near expiry", async () => {
    await seedTokens({ access: "a1", refresh: "r1", expiresIn: 1 });
    const client = new AuthClient({
      refresh: async () => ({ err: new Error("invalid refresh") }),
    } as any);

    const states: boolean[] = [];
    client.onAuthChange((authenticated) => states.push(authenticated));

    const token = await client.getToken();

    expect(token).to.equal(null);
    expect(states).to.deep.equal([false]);
    expect(await readStoredValue("access_token")).to.equal(null);
    expect(await readStoredValue("refresh_token")).to.equal(null);
  });

  it("getToken returns cached token when not near expiry", async () => {
    await seedTokens({ access: "a1", refresh: "r1", expiresIn: 3600 });
    const client = new AuthClient({
      refresh: async () => ({ err: false }),
    } as any);

    const token = await client.getToken();
    expect(token).to.equal("a1");
  });

  it("logout clears auth state and emits unauthenticated", async () => {
    await seedTokens({ access: "a1", refresh: "r1", expiresIn: 3600 });
    const client = new AuthClient({} as any);
    const states: boolean[] = [];
    client.onAuthChange((authenticated) => states.push(authenticated));

    await client.logout();

    expect(await readStoredValue("access_token")).to.equal(null);
    expect(await readStoredValue("refresh_token")).to.equal(null);
    expect(states).to.deep.equal([false]);
  });

  it("getToken refreshes and returns new access when token is near expiry", async () => {
    await seedTokens({ access: "old", refresh: "r1", expiresIn: 1 });
    const client = new AuthClient({
      refresh: async () => ({
        err: false,
        tokens: { access: "new", refresh: "r2", expiresIn: 3600 },
      }),
    } as any);

    const token = await client.getToken();

    expect(token).to.equal("new");
    expect(await readStoredValue("access_token")).to.equal("new");
    expect(await readStoredValue("refresh_token")).to.equal("r2");
  });

  it("handleCallback rejects when state does not match challenge", async () => {
    const client = new AuthClient({} as any);
    sessionStorage.setItem("auth_challenge", JSON.stringify({ state: "expected", verifier: "v" }));
    window.history.replaceState({}, "", "/callback?code=abc&state=wrong");

    let caught: unknown;
    try {
      await client.handleCallback();
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.instanceOf(Error);
    expect((caught as Error).message).to.equal("Invalid authorization state");
  });
});

async function seedTokens(tokens: {
  access: string;
  refresh: string;
  expiresIn: number;
}): Promise<void> {
  const db = await openAuthDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("tokens", "readwrite");
    const store = tx.objectStore("tokens");
    store.put(tokens.access, "access_token");
    store.put(tokens.refresh, "refresh_token");
    store.put(Date.now() + tokens.expiresIn * 1000, "expires_at");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readStoredValue(key: string): Promise<string | null> {
  const db = await openAuthDb();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction("tokens", "readonly");
    const req = tx.objectStore("tokens").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return typeof value === "string" ? value : null;
}

async function openAuthDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("golf-auth", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("tokens")) {
        request.result.createObjectStore("tokens");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearAuthStore(): Promise<void> {
  const db = await openAuthDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("tokens", "readwrite");
    tx.objectStore("tokens").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
