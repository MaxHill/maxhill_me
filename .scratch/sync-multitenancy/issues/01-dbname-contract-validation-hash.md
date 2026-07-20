---
Status: ready-for-agent
---

# Enforce `dbName` sync contract + validation + hash integrity end-to-end

## Parent

`.scratch/sync-multitenancy/PRD.md`

## What to build

Deliver the first multitenancy tracer bullet by making `dbName` a required part of sync behavior from client to server.

This slice must work end-to-end: the client includes `dbName` in sync requests, client-side construction fails fast for invalid names, the server decode layer validates and rejects invalid/missing `dbName`, and request integrity hashing includes `dbName` on both sides.

Validation policy: `^[A-Za-z0-9_-]{1,64}$`.

This slice covers user stories: 3, 4, 5, 6, 12, 14, 15, 17, 20.

## Acceptance criteria

- [ ] Sync request shape includes required `dbName` and the client sends it on every sync call
- [ ] Client fails fast at builder/constructor time when db name is invalid
- [ ] Client also asserts db name validity in sync request creation path (defense-in-depth)
- [ ] Server decode/validation rejects missing `dbName` with bad-request semantics
- [ ] Server decode/validation rejects invalid `dbName` values per regex policy
- [ ] Request hash computation includes `dbName` consistently on client and server
- [ ] Existing hash tests are updated and include a tamper scenario where changing `dbName` breaks integrity
- [ ] End-to-end sync still succeeds for valid `dbName` inputs

## Blocked by

None - can start immediately
