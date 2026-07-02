## Property

`latest_server_version` in response matches max relevant server version boundary.

## Evidence trail

- `lib/sync_engine/sync_engine.ml`: `compute_latest_server_version` folds request cursor, inserted versions, unseen rows.
- `build_sync_response` writes computed value.

## Failure scenario

Cursor regresses or skips ahead, producing duplicate/missed sync windows.

## Instrumentation suggestions

- SUT-side `Always`: assert latest >= base and >= seen inserted/unseen versions.
- Workload-side cross-check with observed operations.

Status vs existing instrumentation: **missing**.

## Open Questions

None.