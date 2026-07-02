## Property

Each `World.step` either receives response or fails within `action_timeout`.

## Evidence trail

- `sim/sut/World.ml`: wraps response wait with `Eio.Time.with_timeout` and failwith on timeout.
- `sim/sut/request_broker.ml`: similar timeout for post-sync ack.

## Failure scenario

Unbounded wait/hang consumes timeline with no assertion signal.

## Instrumentation suggestions

- SUT-side `Always`: no step exceeds timeout without explicit timeout outcome.
- SUT-side `Reachable`: timeout branch markers for exploration guidance.

Status vs existing instrumentation: **missing**.

## Open Questions

None.