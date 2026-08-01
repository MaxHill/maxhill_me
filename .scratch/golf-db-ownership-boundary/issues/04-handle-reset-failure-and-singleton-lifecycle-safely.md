# 04 — Handle reset failure and singleton lifecycle safely

**What to build:** Ensure ownership enforcement remains safe under runtime realities by handling local DB reset failure cases and singleton DB lifecycle interactions so stale instances cannot bypass account-boundary protection.

**Blocked by:** #03 — Enforce ownership transition policy during DB bootstrap.

**Status:** ready-for-agent

- [ ] Reset failure paths behave safely and do not allow continued use of invalid cross-account local state.
- [ ] Singleton DB lifecycle cannot bypass ownership checks after auth identity transitions.
