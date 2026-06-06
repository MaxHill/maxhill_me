---
Status: done
---

# Harden transaction boundary and adopt typed sync errors

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Make the sync execution path resilient to unexpected exceptions and replace string-based error routing with typed sync-domain errors at the engine boundary.

The `POST /sync` path should run through one transaction boundary that always closes correctly (commit on success, rollback on any failure including raised exceptions). The sync engine should return typed errors that the HTTP layer maps deterministically to statuses (validation/integrity -> 4xx, storage/runtime failures -> 5xx) without relying on string-prefix matching.

## Acceptance criteria

- [ ] Transaction wrapper guarantees rollback when callback code raises (not just when it returns `Error`)
- [ ] Sync engine exposes typed errors instead of opaque strings for process failures
- [ ] HTTP mapping for `/sync` is driven by typed errors, not message-prefix checks
- [ ] Existing success behavior for `set`/`setRow`/`remove` remains unchanged
- [ ] `pnpm --filter sync build` and test suite pass

## Blocked by

None - can start immediately
