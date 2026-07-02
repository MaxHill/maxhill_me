## Property

Simulator startup path configures DB pool with one connection to avoid schema visibility races.

## Evidence trail

- `sim_bin/simulator_sut.ml`: comment explains flake mode; sets `Caqti_pool_config.create ~max_size:1`.

## Failure scenario

Multi-connection sqlite setup leads to intermittent `no such table: crdt_operations`.

## Instrumentation suggestions

- `Reachable`: startup path confirms configured max_size=1.
- Optional `Unreachable`: no-such-table error path in simulator run.

Status vs existing instrumentation: **missing**.

## Open Questions

None.