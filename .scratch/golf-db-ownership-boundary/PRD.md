Status: ready-for-agent
Labels: ready-for-agent

## Problem Statement

Users of the `golf` app can create local data in guest mode, then authenticate as one account, log out, and authenticate as a different account on the same device. In this flow, local data can be synced into the wrong authenticated account, causing cross-account contamination and broken state.

## Solution

Implement local database ownership enforcement in the `golf` app as an application-level concern.

The app resolves the current identity as `userID` (authenticated) or `null` (guest), stores a local ownership marker, and applies deterministic ownership transitions during database startup:

- If stored owner is empty and current identity is authenticated, claim ownership for that user.
- If stored owner is authenticated and current identity is a different authenticated user, wipe and reinitialize the local app database, then claim ownership for the new user.
- If current identity is guest, do not overwrite authenticated ownership.

This preserves guest-to-first-login continuity while preventing authenticated account A data from contaminating authenticated account B.

## User Stories

1. As a guest user, I want to create local golf data without logging in, so that I can use the app immediately.
2. As a guest user, I want my local data to remain available while I stay unauthenticated, so that I can continue where I left off.
3. As a first-time authenticated user, I want existing guest data to remain available after login, so that I do not lose pre-login work.
4. As an authenticated user, I want the app to identify me via a stable identity claim, so that ownership checks are deterministic.
5. As an authenticated user, I want local ownership to be claimed for my account once, so that later sessions behave consistently.
6. As an authenticated user switching from account A to account B on the same device, I want local DB state reset before account B activity, so that account A data cannot leak.
7. As a user who logs out to guest mode, I want guest mode to avoid silently overwriting authenticated ownership metadata, so that account boundaries remain intact.
8. As a user with intermittent network, I want ownership enforcement to happen locally, so that protection works offline.
9. As a user, I want sync behavior to stay the same once ownership is valid, so that this fix does not introduce sync regressions.
10. As a developer, I want this to be solved in the app boundary, so that shared CRDT and sync protocol contracts remain stable.
11. As a developer, I want identity sourced from existing auth claims, so that no duplicate identity source is created.
12. As a developer, I want ownership transition behavior to be explicit and testable, so that future regressions are easy to catch.
13. As a developer, I want DB bootstrap to enforce ownership before feature services use the DB, so that stale state cannot be consumed.
14. As a developer, I want singleton DB lifecycle to respect ownership checks, so that reused in-memory DB instances cannot bypass safeguards.
15. As a tester, I want clear scenario coverage for guest->user and userA->userB transitions, so that production risk is reduced.
16. As a maintainer, I want no sync-server or protocol migration for this fix, so that rollout is fast and low risk.
17. As a maintainer, I want this change isolated to the `golf` app, so that other apps and service apps are unaffected.
18. As a product owner, I want a practical containment fix now, so that a serious account-isolation bug is resolved quickly.
19. As a user with multiple tabs open, I want safe behavior when database reset is blocked, so that state is not corrupted.
20. As a future contributor, I want ownership rules documented in one place, so that account-boundary behavior stays intentional.

## Implementation Decisions

- Ownership enforcement is implemented in the `golf` app, not in `idb-distribute`.
- Identity source is the auth claim `userID`; guest mode identity is `null`.
- A local ownership marker is persisted through the app's user settings layer.
- Database startup performs ownership reconciliation before DB use by feature services.
- Ownership transition policy:
  - Stored owner `null/undefined` + current authenticated user: set owner to current user.
  - Stored owner equals current authenticated user: no-op.
  - Stored owner authenticated user differs from current authenticated user: wipe local app DB, reinitialize, set owner to current user.
  - Current guest: do not replace authenticated owner marker.
- Existing sync request/response protocol remains unchanged.
- Existing sync-server filtering behavior remains unchanged.
- Existing auth flow remains unchanged aside from exposing current user identity to DB bootstrap logic.
- Wipe behavior is local-only and tied to ownership mismatch between authenticated users.
- This feature is a bounded containment fix and intentionally avoids introducing shared protocol-level abstractions at this stage.

## Testing Decisions

- Good tests assert externally observable behavior (ownership outcomes and resulting data isolation), not internal implementation details.
- Highest seam: database bootstrap behavior under auth identity transitions.
- Existing seams to use:
  - DB initialization seam used by feature services.
  - Auth client seam for authenticated vs guest identity state.
  - User settings service seam for persisted ownership marker.
- Test scenarios:
  - Guest local state then first login as userA claims ownership without wipe.
  - userA logout then login as userA remains stable and does not wipe.
  - userA logout then login as userB wipes local DB before continued use.
  - Repeated startup with same authenticated user is idempotent.
  - Guest sessions after authenticated ownership do not overwrite ownership marker.
  - Safe failure behavior when DB deletion/reset is blocked.
- Prior art:
  - Existing `golf` tests already use asynchronous DB setup and service-level integration style tests.
  - Existing auth and menu flows already rely on auth state transitions suitable for transition-based assertions.

## Out of Scope

- Any changes to sync protocol semantics, including mixed-client operation upload.
- Any changes to sync-server tenanting or db-name partitioning.
- Generic ownership/scope APIs in `idb-distribute`.
- Operation import/export or local cross-database synchronization primitives.
- New account switching UI, prompts, or migration UX beyond existing behavior.
- Broader auth/session architecture changes outside what is needed for local ownership enforcement.

## Further Notes

- This PRD intentionally chooses a minimal application-level fix over a protocol rewrite.
- The approach preserves current boundaries: auth identifies the user, app enforces local ownership, sync transports operations as-is.
- If future requirements demand local import/export or cross-device local sync, those can be handled in a separate protocol-focused initiative without blocking this bug fix.
