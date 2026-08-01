# 03 — Enforce ownership transition policy during DB bootstrap

**What to build:** During golf app database startup, enforce ownership transitions end-to-end: claim ownership on first authenticated login, keep state for same authenticated user, wipe and reinitialize on authenticated user mismatch, and preserve authenticated ownership during guest mode.

**Blocked by:** #01 — Add auth identity seam for current userID; #02 — Persist DB ownership marker via user settings service.

**Status:** ready-for-agent

- [ ] Startup applies the approved ownership policy before feature services use app data.
- [ ] Switching from one authenticated user to a different authenticated user forces local DB reset and reclaims ownership for the new user.
