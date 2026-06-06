---
Status: done
---

# First end-to-end CRDT path: `Set` variant round-trips through `process_sync_request`

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Implement `process_sync_request` in `lib/sync_engine.ml` for the `Set` payload variant only. The function takes a parsed `sync_request` and a Repository handle, persists each `Set` operation via a new `Repository.insert_crdt_operation` function (mirroring the Go server's `InsertCRDTOperation`, including the idempotent-on-duplicate behavior), fetches any operations newer than the client's `lastSeenServerVersion`, and returns a `sync_response` populated with both `operations` (server-known ops the client should apply) and `syncedOperations` (the dots the server just persisted).

Wire `POST /sync` from the previous slice to call `process_sync_request` instead of returning empty. Use a Caqti transaction across the read+write so the slice mirrors the Go server's transactional behavior.

Non-`Set` variants should still decode successfully (from slice 5) but should fail with a clear "not yet implemented" error in `process_sync_request` to keep the slice scope honest. Slice 7 fills them in.

## Acceptance criteria

- [ ] `lib/sync_engine.ml` exposes a `process_sync_request` function taking a `sync_request` and a Caqti pool / connection handle, returning a `sync_response`
- [ ] `lib/repository.ml` exposes `insert_crdt_operation` and a query for "ops with `server_version` greater than X", matching the Go server's behavior including auto-incremented `server_version` return
- [ ] Inserting a duplicate `(client_id, version)` is idempotent when the row content matches, and raises a consistency-violation exception when it does not (matching the Go semantics)
- [ ] A `POST /sync` containing one `Set` op persists the op to SQLite with the next `server_version`, and the response's `latestServerVersion` reflects the new value
- [ ] A second client posting with `lastSeenServerVersion=0` receives the previously inserted op in the response's `operations` list
- [ ] The full request/response cycle runs inside a single Caqti transaction
- [ ] Non-`Set` variants reaching `process_sync_request` produce a clear logged error and a 5xx response; they do not silently no-op
- [ ] `pnpm --filter sync build` succeeds

## Blocked by

- `.scratch/ocaml-sync-port/issues/04-caqti-sqlite-debug-count.md`
- `.scratch/ocaml-sync-port/issues/05-sync-engine-types-codec.md`
