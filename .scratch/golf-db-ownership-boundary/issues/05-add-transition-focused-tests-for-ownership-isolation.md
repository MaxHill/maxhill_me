# 05 — Add transition-focused tests for ownership isolation

**What to build:** Add automated behavior tests proving account-boundary enforcement works through realistic transitions, including guest-to-user claim, same-user stability, cross-user reset, and idempotent startup behavior.

**Blocked by:** #03 — Enforce ownership transition policy during DB bootstrap; #04 — Handle reset failure and singleton lifecycle safely.

**Status:** ready-for-agent

- [ ] Tests verify guest->authenticated claim and authenticated A->authenticated A no-op behavior.
- [ ] Tests verify authenticated A->authenticated B reset behavior and cover at least one failure-oriented safety path.
