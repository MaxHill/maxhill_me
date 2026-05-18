/**
 * Auth client for the golf app.
 * Manages PKCE OAuth flow, token persistence (IndexedDB), and silent refresh.
 *
 * Exported as a singleton instance — the auth state is inherently global
 * (shared IndexedDB, single set of listeners).
 */

const AUTH_URL = import.meta.env.VITE_AUTH_URL || "http://localhost:3002";
const CLIENT_ID = "golf-app";
const REDIRECT_URI = `${window.location.origin}/callback`;

const DB_NAME = "golf-auth";
const STORE_NAME = "tokens";

type AuthChangeCallback = (authenticated: boolean) => void;

// --- PKCE helpers ---

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array.buffer);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export class AuthClient {
  private listeners: Set<AuthChangeCallback> = new Set();

  // --- IndexedDB helpers ---

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async dbGet<T>(key: string): Promise<T | undefined> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  private async dbSet(key: string, value: unknown): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async dbClear(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private notifyListeners(authenticated: boolean) {
    for (const cb of this.listeners) {
      try {
        cb(authenticated);
      } catch (e) {
        console.error("Auth change listener error:", e);
      }
    }
  }

  // --- Public API ---

  /**
   * Initiates the PKCE authorization redirect flow.
   */
  async authorize(): Promise<void> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    sessionStorage.setItem("auth_code_verifier", codeVerifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge_method: "S256",
      code_challenge: codeChallenge,
      scope: "openid profile",
    });

    window.location.href = `${AUTH_URL}/authorize?${params.toString()}`;
  }

  /**
   * Handles the OAuth callback by exchanging the authorization code for tokens.
   */
  async handleCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const codeVerifier = sessionStorage.getItem("auth_code_verifier");

    if (!code || !codeVerifier) {
      throw new Error("Missing authorization code or code verifier");
    }

    sessionStorage.removeItem("auth_code_verifier");

    const response = await fetch(`${AUTH_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    await this.dbSet("access_token", data.access_token);
    if (data.refresh_token) {
      await this.dbSet("refresh_token", data.refresh_token);
    }
    if (data.expires_in) {
      await this.dbSet("expires_at", Date.now() + data.expires_in * 1000);
    }

    this.notifyListeners(true);
  }

  /**
   * Returns a valid access token, refreshing if expired.
   * Returns null if the user is not authenticated.
   */
  async getToken(): Promise<string | null> {
    const token = await this.dbGet<string>("access_token");
    if (!token) return null;

    const expiresAt = await this.dbGet<number>("expires_at");
    if (expiresAt && Date.now() > expiresAt - 30_000) {
      return await this.refreshToken();
    }

    return token;
  }

  private async refreshToken(): Promise<string | null> {
    const refresh = await this.dbGet<string>("refresh_token");
    if (!refresh) {
      await this.dbClear();
      this.notifyListeners(false);
      return null;
    }

    try {
      const response = await fetch(`${AUTH_URL}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refresh,
          client_id: CLIENT_ID,
        }),
      });

      if (!response.ok) {
        await this.dbClear();
        this.notifyListeners(false);
        return null;
      }

      const data = await response.json();
      await this.dbSet("access_token", data.access_token);
      if (data.refresh_token) {
        await this.dbSet("refresh_token", data.refresh_token);
      }
      if (data.expires_in) {
        await this.dbSet("expires_at", Date.now() + data.expires_in * 1000);
      }

      return data.access_token;
    } catch {
      await this.dbClear();
      this.notifyListeners(false);
      return null;
    }
  }

  /**
   * Clears auth state and notifies listeners.
   */
  async logout(): Promise<void> {
    await this.dbClear();
    this.notifyListeners(false);
  }

  /**
   * Subscribe to auth state changes.
   * Returns an unsubscribe function.
   */
  onAuthChange(cb: AuthChangeCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

export const authClient = new AuthClient();
