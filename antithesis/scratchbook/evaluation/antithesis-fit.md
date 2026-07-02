---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Findings

1. `simulator-uses-single-db-connection-for-schema-visibility` is mostly configuration reachability; lower Antithesis leverage than timing/fault properties.
2. `deterministic-replay-by-seed-and-size` remains high utility despite not being fault-specific; it enables debugging of fault-found counterexamples.
3. Lifecycle properties (`graceful-close-timeout-forces-kill`, `ts-client-must-ack-after-sync-response`) are strong Antithesis-fit due to scheduler/fault interleavings.

## Passes

- Core sync admission properties are good Antithesis candidates when combined with malformed/reordered/retried request workloads.

## Uncertainties

- Actual Antithesis value of strict action-mapping property depends on whether simulator mapping bug is fixed before workload authoring.