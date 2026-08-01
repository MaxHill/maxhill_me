# 02 — Persist DB ownership marker via user settings service

**What to build:** Add an ownership marker capability through the existing user settings abstraction so the app can persist and retrieve which authenticated user currently owns the local golf app database.

**Blocked by:** #01 — Add auth identity seam for current userID.

**Status:** ready-for-agent

- [ ] Ownership marker can be read and written through the user settings service with guest-friendly `null` semantics.
- [ ] Ownership marker behavior is defined so DB bootstrap can consume it consistently across app starts.
