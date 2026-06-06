---
Status: done
---

# Enforce JWT policy constraints in Auth module

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Strengthen token validation policy in `Auth` so accepted tokens must satisfy explicit security constraints, not just signature + expiry.

At minimum, enforce an algorithm allowlist and claim validation for issuer/audience. Keep JWKS cache ownership and background refresh behavior inside `Auth`, while preserving `validate_bearer` as the single entrypoint used by `POST /sync`.

## Acceptance criteria

- [ ] `validate_bearer` rejects tokens whose algorithm is outside configured allowlist
- [ ] `validate_bearer` validates issuer claim against configured issuer URL
- [ ] `validate_bearer` validates audience claim against configured audience value
- [ ] Invalid-policy tokens return 401 from `POST /sync` with logged reason
- [ ] Valid tokens still authenticate and expose `sub`/user id to handler path
- [ ] `pnpm --filter sync build` and test suite pass

## Blocked by

None - can start immediately
