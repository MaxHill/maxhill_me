---
Status: ready-for-agent
---

# Add cross-tenant isolation regression coverage across server and client

## Parent

`.scratch/sync-multitenancy/PRD.md`

## What to build

Deliver the final tracer bullet by locking in multitenancy behavior with regression tests at existing high seams.

Add integration/behavior tests that prove there is no cross-tenant leakage, invalid db names are rejected on both sides, tenant-scoped uniqueness works, and request hash integrity includes db name.

This slice covers user stories: 1, 2, 5, 6, 8, 12, 18, 20.

## Acceptance criteria

- [ ] Cross-tenant integration scenario proves tenant A writes are not returned to tenant B
- [ ] Integration scenario proves per-tenant versioning behavior (no false out-of-sync from other tenants)
- [ ] Repository-level test proves same `(clientId, version)` can be inserted for different tenants
- [ ] Server decode/validation tests cover invalid and missing `dbName`
- [ ] Client-side tests cover fail-fast invalid db name handling and sync-path assertion
- [ ] Hash tests prove mutating `dbName` after hashing causes integrity failure
- [ ] Debug count test verifies tenant-scoped count semantics

## Blocked by

- `.scratch/sync-multitenancy/issues/03-tenant-scoped-read-version-debug.md`
