# PRD: Add User Auth to Golf

## Problem Statement

The golf app syncs data to a shared server without any authentication. Any
client can read/write to the sync endpoint, meaning there's no identity, no
access control, and no path toward per-user data. Users cannot trust that
their data is private or that it will persist across devices tied to their
identity.

## Solution

Integrate the existing OpenAuth-based auth service with the golf frontend
and the Go sync server. Users can use the app fully offline without logging
in, but syncing data to the server requires authentication via a PKCE
redirect flow. The sync server validates JWTs and rejects unauthenticated
requests with 401.

## User Stories

1. As a golfer, I want to use the app offline without creating an account,
   so that I can track rounds without friction.
2. As a golfer, I want to sign in with my email, so that my data syncs to
   the server.
3. As a golfer, I want to see a prompt suggesting I sign in to sync, so
   that I know the feature exists.
4. As a golfer, I want to dismiss the sign-in prompt, so that I'm not
   nagged if I don't want to sync.
5. As a golfer, I want my login to persist across app restarts, so that I
   don't have to sign in every time.
6. As a golfer, I want expired tokens to refresh silently, so that sync
   continues working without interruption.
7. As a golfer, I want to be prompted to re-login only when my session is
   truly expired, so that I understand why sync stopped.
8. As a golfer, I want to sign out from settings, so that I can stop
   syncing or switch accounts.
9. As a golfer, I want my local data to remain intact after signing out, so
   that I don't lose anything.
10. As a golfer, I want unauthenticated sync attempts to fail gracefully,
    so that the app doesn't crash or show confusing errors.
11. As a developer, I want the sync server to reject requests without a
    valid JWT, so that the endpoint is protected.
12. As a developer, I want the sync server to validate tokens locally via
    JWKS, so that auth checks are fast and don't depend on the auth service
    being reachable per-request.
13. As a developer, I want the auth URL to be configurable via environment
    variable, so that dev and production work without code changes.

## Implementation Decisions

### Modules

1. **Sync Server Auth Middleware** (new, Go) — HTTP middleware that
   fetches/caches JWKS from the auth issuer, validates
   `Authorization: Bearer <token>` on every request, returns 401 on
   failure. Passes the `userID` claim to the handler context (unused for
   scoping now, but available). Uses `github.com/lestrrat-go/jwx`.

2. **Golf Auth Client** (new, TypeScript, `src/features/auth/`) — Deep
   module with interface: `authorize()`, `handleCallback()`,
   `getToken(): Promise<string | null>`, `logout()`, `onAuthChange(cb)`.
   Manages PKCE flow via `@openauthjs/openauth` client SDK, persists tokens
   in IndexedDB, handles silent refresh. The rest of the app only calls
   `getToken()`.

3. **Golf Auth UI** (new, Lit components, `src/features/auth/`) — Colocated
   with the auth client:
   - `/callback` route in the existing `universal-router`
   - Contextual "Sign in to sync" banner (shown once, dismissible, stored
     dismissal in IndexedDB)
   - Settings entry showing sign-in/sign-out state

4. **idb-distribute Sync Headers** (modify, `packages/idb-distribute`) —
   Extend `Sync.sendSyncRequest()` (or the builder API) to accept a
   `getHeaders` function so the golf app can inject
   `Authorization: Bearer <token>`. This is the integration seam between
   the auth client and the sync layer.

### Auth Flow

- PKCE Authorization Code flow via redirect to the auth issuer.
- Callback at `/callback` (path-based, handled by existing
  `universal-router`).
- Access token + refresh token stored in IndexedDB.
- On 401 from sync: attempt silent refresh → retry. If refresh fails: clear
  tokens, emit auth-change event, UI shows re-login prompt.

### Configuration

- Golf app: `VITE_AUTH_URL` env var. Defaults to `http://localhost:3002` in
  dev, `https://auth.maxhill.me` in production.
- Sync server: `AUTH_ISSUER_URL` env var (or similar) pointing to the JWKS
  endpoint.

### Rollout

- Hard cutover. Both the sync server middleware and golf app auth are
  shipped together. No backward compatibility period.

## Testing Decisions

### What makes a good test

Tests should verify external behavior through the module's public
interface. They should not depend on internal implementation details (e.g.,
how tokens are stored internally, which IDB object store is used). Tests
should be deterministic and not require network access.

### Modules to test

1. **Sync Server Auth Middleware (Go)**
   - Valid JWT → request passes through with userID in context
   - Expired JWT → 401
   - Malformed/missing token → 401
   - JWKS key rotation → middleware refetches keys and validates
   - Non-matching issuer/audience → 401

2. **Golf Auth Client (TypeScript)**
   - `handleCallback()` extracts tokens from auth response and persists
     them
   - `getToken()` returns cached token when valid
   - `getToken()` triggers refresh when access token is expired
   - `getToken()` returns null and emits auth-change when refresh fails
   - `logout()` clears tokens and emits auth-change
   - `authorize()` initiates redirect with correct PKCE parameters

### Prior art

- Golf app has existing tests using `web-test-runner` (see `*.test.ts`
  files in features/)
- Go sync server tests would follow standard `*_test.go` conventions
  alongside the middleware package

## Out of Scope

- Database naming and multitenancy (data scoping by user)
- User registration/profile management beyond what OpenAuth provides
- Multiple auth providers (Google, GitHub, etc.)
- Rate limiting or abuse prevention
- Token revocation
- Migration of existing unscoped data to a user

## Further Notes

- The `idb-distribute` library currently hardcodes headers in
  `sendSyncRequest()`. The minimal change is adding a
  `getHeaders?: () => Promise<Record<string, string>>` option to the
  builder or sync class. This keeps the library auth-agnostic while
  allowing the golf app to inject the bearer token.
- The auth app currently hashes the email to produce a `userID` with no
  real user database. This is fine for now but will need revisiting when
  user scoping is implemented.
- The sync server's CORS config already allows the `Authorization` header,
  so no CORS changes are needed.
