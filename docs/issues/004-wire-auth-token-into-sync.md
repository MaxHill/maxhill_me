# Wire auth token into sync requests

**Label:** ready-for-agent

## Parent

docs/prd-golf-auth.md

## What to build

Connect the golf auth client to the idb-distribute sync layer so that sync requests include the bearer token, and 401 responses trigger token refresh with retry.

In the golf app's `db.ts` (or wherever the database is built), use the new `getHeaders` hook from idb-distribute to call the auth client's `getToken()` and return an `Authorization` header.

Add 401-retry logic: when a sync request fails with 401, call `getToken()` (which will attempt refresh), and retry once. If still 401, emit an auth-change event so the UI can prompt re-login.

## Acceptance criteria

- [ ] Sync requests include `Authorization: Bearer <token>` when user is authenticated
- [ ] Sync requests proceed without auth header when user is not authenticated (app still works locally)
- [ ] On 401 response: token is refreshed and request retried once
- [ ] On second 401: auth state is cleared, auth-change event fires
- [ ] App continues to function offline/locally regardless of auth state

## Blocked by

- docs/issues/001-idb-distribute-get-headers-hook.md
- docs/issues/003-golf-auth-client.md
