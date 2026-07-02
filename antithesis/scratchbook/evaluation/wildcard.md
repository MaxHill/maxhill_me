---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Findings

1. Oddity: simulator property function `check_properties` is currently `assert true`; harness primarily checks protocol survival, not semantic data invariants.
2. Oddity: `World.step` query action mapping includes likely bug (`Query_post` -> `Client.Query_user`), reducing scenario diversity.
3. Cross-cut concern: because Node client runs as child in same container, some network fault models are less represented than pure distributed deployment.

## Suggested action

- Keep simulator-focused portfolio now; if moving toward production sync service validation, add multi-client/multi-container topology and new property tranche.
