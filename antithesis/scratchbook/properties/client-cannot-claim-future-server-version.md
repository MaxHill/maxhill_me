## Property

Reject requests with `last_seen_server_version` greater than DB max server version.

## Evidence trail

- `lib/sync_engine/sync_engine_validation.ml`: `ensure_client_not_ahead`.
- `lib/sync_engine/sync_engine.ml`: computes `max_server_version` then validates before fetching unseen rows.

## Failure scenario

Client jumps cursor ahead; server skips unseen ops and converges to invalid state.

## Instrumentation suggestions

- SUT-side `Always`: assert `last_seen <= max_server` at validation point.
- Workload-side negative test: crafted request with forward cursor should fail deterministically.

Status vs existing instrumentation: **missing**.

## Open Questions

None.