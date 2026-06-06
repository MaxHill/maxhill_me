---
Status: done
---

# JWT auth: `Auth` module with `jose` + JWKS cache + background refresh

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Introduce `lib/auth.ml` exposing a single `validate_bearer` entrypoint that takes the value of the `Authorization` header and returns a `user_id` on success or raises a typed exception (e.g. `Unauthorized of string`) on failure. Internally the module owns a `Jwks_cache` that:

1. At startup, fetches the JWKS document from `${AUTH_ISSUER_URL}/.well-known/jwks.json` using a Piaf client.
2. Stores the parsed JWK Set in an `Eio.Mutex`-protected ref.
3. Spawns a background Eio fiber that re-fetches every 5 minutes, replacing the stored set.

`validate_bearer` extracts the `Bearer <token>` from the header, parses the JWT with `jose`, verifies the signature against the cached JWK Set (pinning algorithm to whatever the Go server pins, typically RS256/ES256), validates standard claims (`exp`, optionally `iss`/`aud`), and returns the `sub` claim as the user id.

Wire `Auth` into `lib/server.ml` so that `POST /sync` is gated by `validate_bearer`. Update `bin/main.ml` to read `AUTH_ISSUER_URL` and fail fast (process exits non-zero) if it is not set, matching the Go server's behavior. The `GET /health` and `GET /debug/count` endpoints remain unauthenticated.

The background-refresh fiber is started under the same `Eio.Switch` as the server and is torn down when the server shuts down.

## Acceptance criteria

- [ ] `lib/auth.ml` exposes `validate_bearer` (signature returns a `user_id` on success, raises a typed exception on failure)
- [ ] `lib/auth.ml` internally owns the JWKS cache; no JWKS fetching or storage logic lives in `bin/main.ml` or `lib/server.ml`
- [ ] At startup, the OCaml server fetches the JWKS from `${AUTH_ISSUER_URL}/.well-known/jwks.json` and fails fast if the fetch fails (matching Go behavior)
- [ ] A background Eio fiber refreshes the JWKS every 5 minutes (configurable constant in source acceptable)
- [ ] `POST /sync` without an `Authorization` header returns 401
- [ ] `POST /sync` with an invalid or expired Bearer token returns 401
- [ ] `POST /sync` with a valid Bearer token signed by a key in the JWKS succeeds and the extracted `sub` is available to the handler
- [ ] `GET /health` does not require auth
- [ ] `bin/main.ml` exits non-zero if `AUTH_ISSUER_URL` is unset
- [ ] `pnpm --filter sync build` and `pnpm --filter sync dev` succeed end-to-end against a reachable test JWKS endpoint

## Blocked by

`.scratch/ocaml-sync-port/issues/03-piaf-server-health-endpoint.md`
