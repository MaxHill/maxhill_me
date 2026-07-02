## Property

Processing one sync request is atomic: failure leaves no partial writes.

## Evidence trail

- `lib/sync_engine/sync_engine.ml`: wraps request handling in `Repository.with_transaction`.
- `lib/repository.ml`: `with_transaction` maps exceptions/errors and relies on DB txn semantics.

## Failure scenario

Validation/storage error after partial insert commits subset of operations.

## Instrumentation suggestions

- SUT-side `Always`: on error path, per-request inserted count remains zero.
- Fault-assisted test with termination near insert/fetch boundary.

Status vs existing instrumentation: **missing**.

## Open Questions

None.