## Property

JS client fatal paths must surface as simulator failure (non-success exit).

## Evidence trail

- `sim/sut/test_client.js`: line handler catches and emits `CLIENT_FATAL`, exits 1; also exits 1 on unhandled rejection/uncaught exception.
- `sim/sut/Client.ml`: await fiber fails on non-zero/signaled status, preserving stderr tail.

## Failure scenario

Client crashes silently; simulator records false pass.

## Instrumentation suggestions

- Workload/SUT `Always`: child exit status must be zero for pass path.
- Reachability markers for fatal JS handlers.

Status vs existing instrumentation: **missing**.

## Open Questions

None.