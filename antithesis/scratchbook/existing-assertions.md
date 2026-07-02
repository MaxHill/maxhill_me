---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Scan result

Searched `apps/sync` (`*.ml`, `*.mli`, `*.js`, `*.ts`) for Antithesis SDK usage and assertion calls:

- `assert_always`
- `assert_sometimes`
- `assert_reachable`
- `assert_unreachable`
- `antithesis` imports/namespaces

Result: **no existing Antithesis SDK instrumentation found**.

## Notes

- Current simulator failure signaling uses OCaml `failwith/assert` and Node `process.exit(1)`.
- All proposed Antithesis assertions in this scratchbook are therefore **missing** and net-new.
