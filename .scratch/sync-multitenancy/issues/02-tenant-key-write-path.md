---
Status: ready-for-agent
---

# Introduce authoritative tenant key and tenant-scoped write path

## Parent

`.scratch/sync-multitenancy/PRD.md`

## What to build

Deliver the second tracer bullet by threading authoritative tenant context into sync persistence writes.

The API layer composes tenant identity from authenticated `user-id` + request `dbName`, passes tenant context explicitly into sync engine entrypoints, and persists operations with a new tenant partition column (`db_name`, combined key only).

Write-side uniqueness semantics become tenant-scoped so identical `(clientId, version)` pairs can exist in different tenants without conflict.

This slice covers user stories: 1, 2, 7, 8, 13, 19, 20.

## Acceptance criteria

- [ ] API handling composes tenant key from authenticated user identity and validated db name
- [ ] Sync engine interface accepts tenant context as an explicit separate argument
- [ ] Persistence schema includes tenant partition column `db_name` for operations
- [ ] Insert path writes tenant partition value for every operation
- [ ] Duplicate-dot lookup used by idempotent insert behavior is tenant-scoped
- [ ] Dot uniqueness is tenant-scoped (same `(clientId, version)` allowed across different tenants)
- [ ] Repository-level tests cover tenant-scoped uniqueness behavior
- [ ] Valid existing single-tenant behavior still works when only one tenant is used

## Blocked by

- `.scratch/sync-multitenancy/issues/01-dbname-contract-validation-hash.md`
