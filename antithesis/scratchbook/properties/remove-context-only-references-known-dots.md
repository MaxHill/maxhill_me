## Property

`Remove` context references only known dots (in request or persisted DB).

## Evidence trail

- `lib/sync_engine/sync_engine_validation.ml`: `ensure_remove_context_known` checks request set then `Repository.has_operation_dot`.
- `test/sync_engine_integration_test.ml`: `assert_reject_remove_context_unseen_dot`.

## Failure scenario

Unknown context accepted; remove semantics apply against non-existent causal history.

## Instrumentation suggestions

- SUT-side `Always`: each context dot must resolve true before remove accepted.
- SUT-side `Unreachable`: unseen-dot remove reaches insert path.

Status vs existing instrumentation: **missing**.

## Open Questions

None.