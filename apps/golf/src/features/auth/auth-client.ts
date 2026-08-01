/**
 * Auth client for the golf app.
 * Manages OAuth flow via OpenAuth client SDK, token persistence (IndexedDB),
 * and identity resolution.
 *
 * Exported as a singleton instance — the auth state is inherently global
 * (shared IndexedDB, single set of listeners).
 */

import { createClient } from "@openauthjs/openauth/client";
import { createSubjects } from "@openauthjs/openauth/subject";
import type { Challenge, Client as OpenAuthClient, Tokens } from "@openauthjs/openauth/client";

const AUTH_URL = import.meta.env.VITE_AUTH_URL || "http://localhost:3002";
const CLIENT_ID = "golf-app";
const REDIRECT_URI = `${window.location.origin}/callback`;
const CHALLENGE_KEY = "auth_challenge";

const DB_NAME = "golf-auth";
const DB_VERSION = 2;
const STORE_NAME = "tokens";

const subjects = createSubjects({
  user: {
    "~standard": {
      version: 1,
      vendor: "golf-auth-client",
      validate: (value: unknown) => {
        if (typeof value !== "object" || value === null) {
          return {
            issues: [{ message: "Expected subject object" }],
          };
        }

        const candidate = value as Record<string, unknown>;
        if (typeof candidate.userID !== "string") {
          return {
            issues: [{ message: "Expected userID string" }],
          };
        }

        return {
          value: {
            userID: candidate.userID,
          },
        };
      },
    },
  },
});

type AuthChangeCallback = (authenticated: boolean) => void;
export type UserSubjects = {
  userID: string;
};

export class AuthClient {
  private listeners: Set<AuthChangeCallback> = new Set();
  private openAuthClient: OpenAuthClient;

  constructor(openAuthClient?: OpenAuthClient) {
    this.openAuthClient = openAuthClient ?? createClient({
      clientID: CLIENT_ID,
      issuer: AUTH_URL,
    });
  }

  // --- Public API ---

  /**
   * Initiates the OpenAuth PKCE authorization redirect flow.
   */
  async authorize(): Promise<void> {
    const result = await this.openAuthClient.authorize(REDIRECT_URI, "code", {
      pkce: true,
    });

    sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(result.challenge));
    window.location.href = result.url;
  }

  /**
   * Handles the OAuth callback by exchanging the authorization code for tokens
   * via OpenAuth.
   */
  async handleCallback(): Promise<void> {
    const params = getCallbackParams(window.location);
    const authError = params.get("error");
    if (authError) {
      const description = params.get("error_description");
      throw new Error(
        description
          ? `Authorization failed: ${authError} (${description})`
          : `Authorization failed: ${authError}`,
      );
    }

    const code = params.get("code");
    const state = params.get("state");
    const challenge = readChallenge();

    if (!code || !state || !challenge?.verifier) {
      throw new Error("Missing authorization code or code verifier");
    }

    if (state !== challenge.state) {
      throw new Error("Invalid authorization state");
    }

    sessionStorage.removeItem(CHALLENGE_KEY);

    const exchanged = await this.openAuthClient.exchange(code, REDIRECT_URI, challenge.verifier);
    if (exchanged.err) {
      throw new Error(`Token exchange failed: ${exchanged.err.message}`);
    }

    await this.saveTokens(exchanged.tokens);

    this.notifyListeners(true);
  }

  /**
   * Returns a valid access token and refreshes if needed.
   * Returns null if the user is not authenticated.
   */
  async getToken(): Promise<string | null> {
    const access = await this.dbGet<string>("access_token");
    if (!access) {
      return null;
    }

    const expiresAt = await this.dbGet<number>("expires_at");
    const isNearExpiry = !expiresAt || Date.now() > expiresAt - 30_000;

    if (!isNearExpiry) {
      return access;
    }

    const refresh = await this.dbGet<string>("refresh_token");
    if (!refresh) {
      await this.logout();
      return null;
    }

    try {
      const refreshed = await this.openAuthClient.refresh(refresh, { access });
      if (refreshed.err) {
        await this.logout();
        return null;
      }

      if (refreshed.tokens) {
        await this.saveTokens(refreshed.tokens);
        return refreshed.tokens.access;
      }

      return access;
    } catch {
      await this.logout();
      return null;
    }
  }

  /**
   * Resolves verified user subject properties or returns null for guest.
   */
  async getUserSubjects(): Promise<UserSubjects | null> {
    const access = await this.getToken();
    if (!access) {
      return null;
    }

    const refresh = await this.dbGet<string>("refresh_token");

    try {
      const verified = await this.openAuthClient.verify(
        subjects,
        access,
        refresh ? { refresh } : undefined,
      );

      if (verified.err) {
        await this.logout();
        return null;
      }

      if (verified.tokens) {
        await this.saveTokens(verified.tokens);
      }

      return extractUserSubjects(verified.subject);
    } catch {
      await this.logout();
      return null;
    }
  }

  /**
   * Resolves the current app identity as authenticated `userID` or guest `null`.
   */
  async getCurrentUserID(): Promise<string | null> {
    const userSubjects = await this.getUserSubjects();
    return userSubjects?.userID ?? null;
  }

  private async saveTokens(tokens: Tokens): Promise<void> {
    await this.dbSet("access_token", tokens.access);
    await this.dbSet("refresh_token", tokens.refresh);
    await this.dbSet("expires_at", Date.now() + tokens.expiresIn * 1000);
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

  // --- IndexedDB helpers ---

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) {
          req.result.createObjectStore(STORE_NAME);
        }
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
}

export const authClient = new AuthClient();

function getCallbackParams(locationLike: Location): URLSearchParams {
  const query = new URLSearchParams(locationLike.search);
  if (query.has("code") || query.has("error")) {
    return query;
  }

  const hash = locationLike.hash.startsWith("#") ? locationLike.hash.slice(1) : locationLike.hash;
  return new URLSearchParams(hash);
}

function readChallenge(): Challenge | null {
  const raw = sessionStorage.getItem(CHALLENGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Challenge;
  } catch {
    return null;
  }
}

function extractUserSubjects(subject: unknown): UserSubjects | null {
  if (typeof subject !== "object" || subject === null) return null;

  const candidate = subject as {
    type?: unknown;
    properties?: unknown;
  };

  if (candidate.type !== "user") return null;
  if (typeof candidate.properties !== "object" || candidate.properties === null) return null;

  const properties = candidate.properties as { userID?: unknown };
  if (typeof properties.userID !== "string" || properties.userID.length === 0) {
    return null;
  }

  return properties as UserSubjects;
}
