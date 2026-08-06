# Sync server JWKS auth middleware

> **Historical:** written before the sync server was ported to OCaml.
> The middleware described below was ultimately implemented in OCaml
> (Piaf + `jose`) rather than Go/`jwx`. See `apps/syncdb-server/lib/auth.ml`
> for the shipped code. The requirements below remain accurate; only
> the language and library changed.

**Label:** ready-for-agent

## Parent

docs/prd-golf-auth.md

## What to build

Add an HTTP middleware to the Go sync server that validates JWT bearer tokens on every request to `/sync`. The middleware should:

- Extract the `Authorization: Bearer <token>` header
- Validate the JWT signature against the auth issuer's JWKS endpoint (fetched and cached using `github.com/lestrrat-go/jwx`)
- Return 401 with a JSON error body if the token is missing, malformed, or invalid
- Pass the `userID` claim from the token into the request context (for future use)
- Accept the issuer URL via an environment variable (e.g. `AUTH_ISSUER_URL`)

## Acceptance criteria

- [ ] Requests without `Authorization` header receive 401
- [ ] Requests with an invalid/expired JWT receive 401
- [ ] Requests with a valid JWT pass through to the sync handler
- [ ] The `userID` claim is available in the handler context
- [ ] JWKS keys are cached and refreshed periodically (not fetched per-request)
- [ ] Test: valid token passes
- [ ] Test: expired token returns 401
- [ ] Test: malformed token returns 401
- [ ] Test: missing header returns 401

## Blocked by

None - can start immediately
