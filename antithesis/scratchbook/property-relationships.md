---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Cluster A: Request admission guards

- `request-hash-integrity-enforced`
- `client-cannot-claim-future-server-version`
- `per-client-dot-versions-are-contiguous`
- `remove-context-only-references-known-dots`
- `duplicate-dot-must-be-equivalent`

Connection: all execute before/around write admission; failure should block unsafe state transitions.

Suspected dominance:
- `request-hash-integrity-enforced` often dominates malformed payload classes before deeper validators run.

## Cluster B: Response/cursor correctness

- `unseen-operations-ordered-by-server-version`
- `sync-response-latest-version-monotonic`
- `request-transaction-all-or-nothing`

Connection: protects deterministic state convergence and cursor movement after writes.

Suspected dominance:
- `request-transaction-all-or-nothing` dominates many downstream ordering anomalies caused by partial writes.

## Cluster C: Simulator protocol liveness + teardown

- `ts-client-must-ack-after-sync-response`
- `simulator-step-timeout-fails-fast`
- `graceful-close-timeout-forces-kill`
- `ts-client-fatal-errors-surface-to-simulator`

Connection: ensures simulator timelines fail fast and cleanly under child-process faults.

## Cluster D: Harness determinism and coverage controls

- `deterministic-replay-by-seed-and-size`
- `simulator-uses-single-db-connection-for-schema-visibility`
- `query-post-action-sends-query-post-command`

Connection: these properties keep harness behavior trustworthy (reproducible + intended action coverage).

## Cross-cluster links

- `query-post-action-sends-query-post-command` influences how much evidence can be gathered for response/cursor properties (Cluster B), because wrong action mapping suppresses post-query exercise.
- `ts-client-fatal-errors-surface-to-simulator` is prerequisite for reliable interpretation of all other property failures; otherwise failures could be hidden.
