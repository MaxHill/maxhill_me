## Property

Reject sync requests with mismatched `request_hash`.

## Evidence trail

- `lib/sync_engine/sync_engine_validation.ml`: `ensure_request_hash_valid` compares computed hash vs request value.
- `lib/sync_engine/sync_engine.ml`: calls hash validation before transaction body.
- `test/sync_engine_integration_test.ml`: `assert_reject_invalid_request_hash`.

## Failure scenario

Tampered payload accepted and persisted despite hash mismatch.

## Instrumentation suggestions

- SUT-side `Always`: unique message on hash mismatch rejection branch.
- SUT-side `Unreachable`: branch where mismatched hash reaches `Repository.insert_crdt_operations`.

Status vs existing instrumentation: **missing** (no Antithesis SDK assertions in codebase).

## Open Questions

None.