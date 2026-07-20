---
Status: ready-for-agent
---

# Scope read/query/version/debug behavior to tenant stream

## Parent

`.scratch/sync-multitenancy/PRD.md`

## What to build

Deliver the third tracer bullet by completing tenant isolation on all read and validation paths.

All sync reads and consistency checks must be tenant-scoped: fetching unseen operations, max server version checks, remove-context dot existence checks, and debug counting behavior.

Result: `lastSeenServerVersion` semantics are per-tenant stream semantics, and clients cannot observe operation metadata outside their tenant partition.

This slice covers user stories: 1, 2, 7, 9, 10, 11, 18, 20.

## Acceptance criteria

- [ ] Unseen-operation fetches are filtered by tenant partition
- [ ] Max server version lookup used for out-of-sync checks is tenant-scoped
- [ ] Remove-context dot existence checks are tenant-scoped
- [ ] Any other sync validation query depending on operation existence/version is tenant-scoped
- [ ] `/debug/count` behavior is tenant-scoped and does not leak global totals
- [ ] Integration behavior demonstrates per-tenant version stream semantics for `lastSeenServerVersion`
- [ ] Existing non-tenant functionality remains unchanged inside a single tenant

## Blocked by

- `.scratch/sync-multitenancy/issues/02-tenant-key-write-path.md`
