Status: ready-for-agent
Labels: ready-for-agent

## Problem Statement

Users of the `golf` app authenticate through an app-local auth client implementation that manually performs token exchange, refresh, and identity extraction. This drifts from the intended OpenAuth integration path and creates avoidable maintenance risk. The current implementation also introduced manual JWT payload decoding for `userID`, which duplicates functionality the OpenAuth client already provides.

From the user's perspective, auth should remain reliable and seamless, but from the maintainer's perspective, identity and token behavior should be delegated to the supported OpenAuth client library rather than custom logic.

## Solution

Migrate the `golf` app auth client module to use OpenAuth's client SDK as the source of truth for auth flow and identity verification, while preserving the app-facing auth interface already used by the rest of `golf`.

The app continues to expose the same public auth surface (`authorize`, `handleCallback`, `getToken`, `logout`, `onAuthChange`, `getCurrentUserID`), but internally uses OpenAuth client operations for authorization flow, token handling, refresh behavior, and verified identity extraction (`userID`).

A re-auth event for existing sessions is acceptable for this migration.

## User Stories

1. As a golfer, I want sign-in to continue working after this migration, so that I can still sync data.
2. As a golfer, I want sign-out to continue working consistently, so that I can stop syncing or switch accounts.
3. As a golfer, I want silent refresh behavior to continue when sessions are valid, so that I am not interrupted.
4. As a golfer, I want failed refresh to move me to signed-out state, so that I can recover by signing in again.
5. As a golfer, I want login state changes to propagate to the app immediately, so that UI and sync behavior stay accurate.
6. As a golfer, I want account identity (`userID`) to be resolved from verified auth data, so that account-boundary behavior is trustworthy.
7. As a golfer, I want guest mode to continue working without login, so that I can use the app offline immediately.
8. As a golfer, I want account switching behavior to remain predictable, so that local data ownership enforcement remains correct.
9. As a maintainer, I want auth behavior to use the OpenAuth client library instead of bespoke logic, so that security-sensitive code surface is reduced.
10. As a maintainer, I want to remove manual JWT payload decoding, so that identity extraction is not duplicated.
11. As a maintainer, I want the existing app-facing auth interface to remain stable, so that feature modules do not need broad rewrites.
12. As a maintainer, I want identity sourcing to align with OpenAuth verification APIs, so that claim access semantics are explicit.
13. As a maintainer, I want a bounded migration that is isolated to the `golf` app auth client seam, so that risk is contained.
14. As a maintainer, I want tests to prove behavioral equivalence at module seams, so that refactoring confidence is high.
15. As a tester, I want coverage for callback handling, token retrieval, refresh, logout, and identity extraction, so that regressions are caught early.
16. As a product owner, I want this migration to avoid protocol/server changes, so that rollout remains low risk.
17. As an operator, I want existing env-driven auth issuer configuration to remain valid, so that deploy configuration is unchanged.
18. As a future contributor, I want auth responsibilities centered in one deep module, so that future auth changes are easy to reason about.

## Implementation Decisions

- Migration target is the `golf` app auth client deep module; external module interface remains unchanged.
- Internal auth flow implementation uses OpenAuth client SDK primitives rather than bespoke fetch-based token exchange logic.
- `getCurrentUserID` resolves from verified OpenAuth subject/claims, not manual JWT payload decoding.
- Existing identity contract remains: authenticated -> `userID`, guest -> `null`.
- Existing auth change notification behavior (`onAuthChange`) remains the integration contract for app features and DB lifecycle logic.
- Existing environment-based issuer configuration remains in effect.
- Re-auth is acceptable for migration; backward compatibility of previously stored token format is not required.
- No sync protocol, sync-server, or `idb-distribute` contract changes are part of this migration.
- No new auth provider UX or account-management UX is introduced; this is an internal auth-client migration.

## Testing Decisions

- Good tests assert externally observable behavior through public interfaces, not implementation details of SDK internals or storage internals.
- Highest seam: the `golf` auth client public API seam.
- Preferred existing seams:
  - Auth client public methods (`authorize`, `handleCallback`, `getToken`, `logout`, `onAuthChange`, `getCurrentUserID`).
  - DB bootstrap seam that consumes auth identity (`getCurrentUserID`) to preserve ownership-boundary behavior.
- Scenario coverage:
  - Callback handling produces authenticated state and usable token path.
  - Valid session returns token.
  - Expired session refreshes when possible.
  - Refresh failure returns unauthenticated outcome and emits auth-change.
  - Logout clears auth state and emits auth-change.
  - `getCurrentUserID` resolves verified `userID` when authenticated; `null` when guest.
  - Ownership-boundary smoke path continues to behave correctly with migrated identity seam.
- Prior art:
  - Existing `golf` tests already exercise auth client behavior and DB ownership transition behavior with service-level integration style tests.

## Out of Scope

- Sync protocol semantics or sync request/response schema changes.
- Sync-server auth middleware behavior changes.
- `idb-distribute` API changes.
- Auth service app behavior changes.
- New login/account UI features beyond preserving current behavior.
- Broad refactor of unrelated `golf` features.

## Further Notes

- This migration intentionally reduces custom auth logic in a static app (`golf`) and aligns with the intended OpenAuth integration direction.
- Because re-auth is acceptable, migration can prefer correctness and clarity over token-store backward compatibility complexity.
- Keep this effort isolated and reviewable: one auth-client migration task, with ownership-boundary behavior verified at existing consuming seam.
