# 01 — Add auth identity seam for current userID

**What to build:** Expose a stable app-facing auth identity seam that resolves the current session as authenticated `userID` or guest `null`, so ownership decisions can be made deterministically before database usage.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The app can resolve current identity as `userID` when authenticated and `null` when in guest mode.
- [ ] Identity resolution behavior is documented and usable by database bootstrap logic without changing sync protocol behavior.
