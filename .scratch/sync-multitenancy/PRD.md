---
Status: ready-for-agent
---

# PRD: Multitenancy for sync server + idb-distribute

## Problem Statement

The sync system currently treats all operations as belonging to one global operation stream. In practice, we need tenant isolation so that one authenticated user cannot read or write another user’s sync data, and so that multiple logical databases can coexist safely.

Today, the API layer has authenticated user context (`user-id`), but that context is not used to partition persisted sync operations. Also, the sync request payload does not include a logical `dbName`, so the server cannot distinguish multiple app-level databases for the same authenticated user.

Without multitenancy, cross-tenant leakage and accidental data mixing are possible.

## Solution

Introduce explicit tenant partitioning across both client and server.

From the user perspective:
- Client sends `dbName` with each sync request.
- Server derives an authoritative tenant key by combining request `dbName` with authenticated `user-id`.
- All sync reads/writes/consistency checks are scoped to that tenant key.

Key behaviors:
- Tenant stream is isolated for versioning (`lastSeenServerVersion` semantics become per-tenant stream semantics).
- Database schema stores the tenant partition key in a new column (`db_name`), and query/index/uniqueness logic is tenant-scoped.
- `dbName` is required and validated on both client and server using the same policy.
- Request hashing includes `dbName` so integrity protection also covers tenant routing fields.

## User Stories

1. As an authenticated end user, I want my sync operations isolated from other users, so that I never receive another user’s data.
2. As an authenticated end user, I want my writes to affect only my own tenant stream, so that another user cannot observe my private changes.
3. As an app developer, I want to specify a `dbName` per logical local database, so that multiple app datasets can sync independently under one account.
4. As an app developer, I want `dbName` to be required in sync requests, so that tenant routing is explicit and not accidental.
5. As an app developer, I want invalid `dbName` values rejected early in the client API, so that failures occur before network calls.
6. As an app developer, I want the server to validate `dbName` too, so that malformed or bypassed clients cannot poison tenant partitions.
7. As a backend maintainer, I want tenant scoping enforced in persistence queries, so that data isolation is guaranteed at the storage boundary.
8. As a backend maintainer, I want operation uniqueness (`clientId + version`) scoped by tenant, so that client IDs can safely exist in multiple tenants.
9. As a backend maintainer, I want remove-context checks scoped by tenant, so that context validation cannot accidentally match dots from another tenant.
10. As a backend maintainer, I want max server version checks scoped by tenant, so that client out-of-sync errors are computed correctly per tenant stream.
11. As a backend maintainer, I want unseen-operations queries scoped by tenant, so that pull responses include only tenant-local operations.
12. As a backend maintainer, I want request integrity hashing to include `dbName`, so that request tampering across tenant dimensions is detectable.
13. As a security-minded maintainer, I want tenant key composition to rely on authenticated user identity (not user input), so that users cannot impersonate another tenant.
14. As an SDK consumer, I want `CRDTDatabase`’s existing database name to be reused for sync `dbName`, so that the API remains simple and predictable.
15. As an SDK consumer, I want a defensive assertion in sync request creation, so that unexpected invalid state still fails fast even after construction.
16. As a maintainer, I want no legacy migration complexity for existing prod rows in this change, so that we can ship a clean tenant-aware schema path.
17. As a maintainer, I want missing `dbName` requests to hard-fail with bad request errors, so that rollout mistakes are obvious.
18. As a maintainer, I want debug count behavior to be tenant-scoped, so that debug endpoints do not leak cross-tenant aggregate information.
19. As a maintainer, I want sync engine API to accept tenant context explicitly as a separate argument, so that auth-derived context is not conflated with raw client payload.
20. As a future maintainer, I want clear validation and partitioning invariants documented in tests, so that future refactors do not regress tenant isolation.

## Implementation Decisions

- Add required `dbName` to sync request contract.
- Validate `dbName` with this regex on both client and server: `^[A-Za-z0-9_-]{1,64}$`.
- Reuse the existing CRDT database name as the sync request `dbName` source.
- Enforce fail-fast validation at client builder/constructor time, with an additional assertion in the sync request path.
- Server validation occurs at sync-request decode layer (shape + value validation in one place).
- Server rejects requests missing `dbName` with a hard bad-request error.
- Request hash input now includes `dbName`; request integrity checks must be updated consistently across client and server.
- Sync engine receives tenant routing as a separate explicit argument (not embedded into auth-untrusted request internals).
- Tenant key composition uses authenticated user identity plus request db name (`{dbName}:{userId}` concept), and this composed value is used for persistence partitioning.
- SQLite schema gains a tenant partition column named `db_name` (combined tenant key only; no separate db/user columns).
- Dot uniqueness constraint becomes tenant-scoped: uniqueness includes tenant column in addition to `(client_id, version)`.
- All repository query paths used by sync processing are tenant-scoped, including:
  - inserts,
  - duplicate-dot lookup,
  - operations-since fetch,
  - max server version,
  - has-dot checks,
  - count/debug paths used in API behavior.
- Versioning semantics are explicitly per-tenant stream.
- Keep auto-increment server versions; no dense per-tenant counter bookkeeping required.
- No migration/backfill path is required for this rollout because no live production dataset needs migration.
- Debug count endpoint behavior should be tenant-scoped for isolation.

## Testing Decisions

- Good tests assert external behavior and safety invariants (tenant isolation, validation behavior, protocol compatibility), not internal helper implementation details.

- Primary server seam: sync request processing through existing sync engine + repository integration tests. Validate that tenant A operations are never visible in tenant B responses, and tenant-scoped version checks behave correctly.

- Secondary server seam: repository tests that validate tenant-scoped uniqueness and tenant-filtered query results.

- API seam: decode/validation tests for required `dbName`, regex enforcement, and missing/invalid rejection paths.

- Client seam (`idb-distribute`): sync request creation and send path tests asserting required `dbName`, validation failures, and hash consistency updates.

- Prior art in current codebase:
  - Existing sync engine decode/hash tests and integration tests in the sync app.
  - Existing repository tests for insert/query/idempotency semantics.
  - Existing sync request/headers tests in idb-distribute.

- Add new behavior tests for:
  - request hash mismatch after `dbName` mutation,
  - same `(clientId, version)` accepted across different tenants,
  - strict rejection of invalid dbName values on both client and server,
  - tenant-scoped debug count behavior.

## Out of Scope

- Row-level authorization beyond tenant partitioning.
- Multi-tenant analytics/reporting features.
- Backward-compatible legacy fallback for missing `dbName` clients.
- New admin/global endpoints for cross-tenant introspection.
- Encryption-at-rest or key management changes.
- Non-sync modules unrelated to tenant routing.

## Further Notes

- Tenant isolation depends on trusted server-side user identity extraction; request payload alone must never define user scope.
- Validation logic duplication between server and client is intentional to provide both early UX feedback and server trust boundaries.
- This PRD assumes no production migration constraints; if that assumption changes, a follow-up migration PRD is required.
