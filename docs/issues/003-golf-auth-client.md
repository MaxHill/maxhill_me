# Golf auth client (PKCE + token persistence)

**Label:** ready-for-agent

## Parent

docs/prd-golf-auth.md

## What to build

Create a new `src/features/auth/` module in the golf app that manages the full PKCE authentication lifecycle using `@openauthjs/openauth` client SDK.

Public interface:
- `authorize()` — initiates PKCE redirect to the auth issuer
- `handleCallback()` — extracts tokens from the `/callback` redirect, persists them
- `getToken(): Promise<string | null>` — returns a valid access token (refreshing silently if expired), or null if not authenticated
- `logout()` — clears stored tokens
- `onAuthChange(cb: (authenticated: boolean) => void)` — subscribe to auth state changes

Token storage: IndexedDB (a dedicated object store or a simple key-value entry alongside existing data).

The auth issuer URL should come from `import.meta.env.VITE_AUTH_URL` (defaults to `http://localhost:3002`).

## Acceptance criteria

- [ ] `authorize()` redirects to the auth issuer with correct PKCE parameters
- [ ] `handleCallback()` exchanges the code for tokens and persists them
- [ ] `getToken()` returns cached token when still valid
- [ ] `getToken()` refreshes silently when access token is expired
- [ ] `getToken()` returns null and fires auth-change when refresh fails
- [ ] `logout()` clears tokens and fires auth-change
- [ ] Tokens persist across page reloads (IndexedDB)
- [ ] `@openauthjs/openauth` added as a dependency
- [ ] `VITE_AUTH_URL` env var is respected
- [ ] Test: handleCallback persists tokens
- [ ] Test: getToken triggers refresh on expiry
- [ ] Test: getToken returns null when refresh fails
- [ ] Test: logout clears state

## Blocked by

None - can start immediately
