# Golf auth UI (callback route, banner, settings)

**Label:** ready-for-agent

## Parent

docs/prd-golf-auth.md

## What to build

Add the user-facing auth UI to the golf app, colocated in `src/features/auth/`:

1. **`/callback` route** — register in the existing universal-router config. On load, calls `handleCallback()` from the auth client, then navigates to the home page.

2. **Contextual "Sign in to sync" banner** — shown once when the user is not authenticated. Dismissible. Dismissal state persisted in IndexedDB so it doesn't reappear. Clicking it calls `authorize()`.

3. **Settings entry** — shows current auth state (signed in / signed out). Provides sign-in button (calls `authorize()`) or sign-out button (calls `logout()`). Subscribes to auth-change events to stay current.

## Acceptance criteria

- [ ] `/callback` route exists and successfully completes the auth flow
- [ ] After callback, user is redirected to the home page
- [ ] Banner appears for unauthenticated users who haven't dismissed it
- [ ] Banner is dismissible and does not reappear after dismissal
- [ ] Banner triggers the auth flow when clicked
- [ ] Settings shows sign-in button when unauthenticated
- [ ] Settings shows sign-out button when authenticated
- [ ] Sign-out clears auth state but preserves local data
- [ ] Re-login prompt appears when silent refresh fails

## Blocked by

- docs/issues/003-golf-auth-client.md
