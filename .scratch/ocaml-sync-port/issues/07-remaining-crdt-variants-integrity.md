---
Status: done
---

# Remaining CRDT variants + integrity rules

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Extend `process_sync_request` to handle every variant in `op_payload` (`Set_row`, `Remove`, and any others present in the Go op vocabulary), and port the integrity invariants currently enforced in `internal/sync_engine/integrity.go`. The compiler's exhaustiveness check on the pattern match in `process_sync_request` is the load-bearing safety net for "did we handle every variant?" — explicitly do not use a wildcard `_ ->` branch.

Integrity rules to preserve from the Go server include (non-exhaustive — confirm by reading `integrity.go`): the `Remove` op's `context` must reference dots the server has actually seen; ops within a single request must form a contiguous version range per client; the `requestHash` the client sent must match what the server computes from the request body. Each rule that fails should surface as a typed exception caught at the HTTP boundary and mapped to the appropriate 4xx status.

This slice does not add new endpoints. It deepens the existing `POST /sync` to handle the full op vocabulary.

## Acceptance criteria

- [ ] Every variant of `op_payload` has an arm in `process_sync_request`'s pattern match; no wildcard arm exists
- [ ] All integrity rules from `internal/sync_engine/integrity.go` are present in the OCaml `Sync_engine` and produce equivalent rejection behavior
- [ ] A `POST /sync` with mixed-variant operations succeeds, persists all variants correctly, and returns them on subsequent fetches
- [ ] Invariant violations return appropriate 4xx status codes (not 500) with a logged reason
- [ ] Hand-crafted requests covering each variant produce the same observable behavior (persisted state in SQLite, response shape) as the Go server for the same input
- [ ] `pnpm --filter sync build` succeeds with no warnings

## Blocked by

`.scratch/ocaml-sync-port/issues/06-crdt-set-end-to-end.md`
