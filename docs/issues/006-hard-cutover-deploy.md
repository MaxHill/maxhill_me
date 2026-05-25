# Hard cutover: enable auth middleware + env config

**Label:** ready-for-agent

## Parent

docs/prd-golf-auth.md

## What to build

Coordinate the final activation of auth across all services:

1. Configure `AUTH_ISSUER_URL` on the sync server (pointing to `https://auth.maxhill.me` in production)
2. Configure `VITE_AUTH_URL=https://auth.maxhill.me` for the golf app production build
3. Register the golf app's callback URL (`https://<golf-domain>/callback`) with the auth issuer if required
4. Deploy sync server with middleware enabled
5. Deploy golf app with auth client active
6. Verify end-to-end: unauthenticated sync gets 401, authenticated sync succeeds

## Acceptance criteria

- [ ] Sync server rejects unauthenticated requests with 401 in production
- [ ] Golf app can complete PKCE flow against production auth issuer
- [ ] Authenticated sync works end-to-end in production
- [ ] App remains fully functional offline without auth

## Blocked by

- docs/issues/002-sync-server-jwks-auth-middleware.md
- docs/issues/004-wire-auth-token-into-sync.md
- docs/issues/005-golf-auth-ui.md
