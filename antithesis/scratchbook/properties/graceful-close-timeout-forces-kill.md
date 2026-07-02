## Property

If graceful close times out, simulator force-kills child and completes teardown.

## Evidence trail

- `sim/sut/World.ml`: close path uses timeout around `wait_for_exit`; on timeout logs warning, calls `w.client.force_close ()`, waits again.
- `sim/sut/Client.ml`: `force_close` sends `Sys.sigkill` via `Eio.Process.signal`.

## Failure scenario

Child process leaks or simulator hangs forever during cleanup.

## Instrumentation suggestions

- SUT-side `AlwaysOrUnreachable`: if close timeout branch entered, child exit status eventually resolved.
- Reachability marker on force-close branch.

Status vs existing instrumentation: **missing**.

## Open Questions

None.