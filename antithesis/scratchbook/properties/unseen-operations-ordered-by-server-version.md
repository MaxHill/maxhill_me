## Property

Unseen operations in sync response preserve ascending server version order.

## Evidence trail

- `lib/repository.ml`: `get_operations_since_query` uses `ORDER BY server_version ASC`.
- `lib/sync_engine/sync_engine.ml`: pulls unseen rows and encodes them directly into response operations.

## Failure scenario

Out-of-order delivery causes non-deterministic merge/replay outcomes.

## Instrumentation suggestions

- Workload-side `Always`: verify response op order monotonic on decoded payloads.
- Optional SUT-side marker at fetch boundary with first/last server_version.

Status vs existing instrumentation: **missing**.

## Open Questions

None.