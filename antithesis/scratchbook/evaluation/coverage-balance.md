---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Findings

1. Strong coverage on admission safety invariants (hash, version, context, duplicate-dot).
2. Initial gap found in simulator action-routing correctness; now covered by `query-post-action-sends-query-post-command`.
3. Liveness represented but narrow (mostly handshake timeout); future expansion candidate: eventual convergence after repeated sync rounds.

## Passes

- Mix includes Safety, Liveness, Reachability; not all-Always monoculture.
- Properties span sync engine + simulator harness, not only one module.

## Uncertainties

- No external incident history was provided, so regression-target coverage is code-derived only.