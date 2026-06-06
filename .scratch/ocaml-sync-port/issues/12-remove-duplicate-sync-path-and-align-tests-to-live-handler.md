---
Status: done
---

# Remove duplicate `/sync` path and align tests to live handler

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Eliminate duplicate `/sync` behavior paths in server code so only the live request-handler path defines sync behavior.

Update tests to exercise the same path used in runtime, reducing drift between route-level unit behavior and integrated HTTP behavior.

## Acceptance criteria

- [ ] `/sync` behavior is implemented in one canonical server path only
- [ ] Tests for `/sync` validate the live handler path instead of a parallel route-only path
- [ ] No behavior regressions for health/debug endpoints
- [ ] `pnpm --filter sync build` and test suite pass

## Blocked by

`.scratch/ocaml-sync-port/issues/09-harden-transaction-boundary-and-typed-sync-errors.md`
