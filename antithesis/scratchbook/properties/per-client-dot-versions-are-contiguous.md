## Property

Within a request, each client’s dot versions are contiguous (no gaps).

## Evidence trail

- `lib/sync_engine/sync_engine_validation.ml`: `ensure_versions_contiguous` groups by client, sorts, checks `succ` relation.
- `test/sync_engine_integration_test.ml`: `assert_reject_non_contiguous_versions`.

## Failure scenario

Gap accepted (`1,3`) can break causal assumptions and replay semantics.

## Instrumentation suggestions

- SUT-side `Always`: reject non-contiguous version list.
- Reachability marker on non-contiguous rejection path to ensure workload hits it.

Status vs existing instrumentation: **missing**.

## Open Questions

None.