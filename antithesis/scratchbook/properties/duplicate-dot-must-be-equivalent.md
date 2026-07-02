## Property

Duplicate `(client_id,version)` insert is idempotent only when payload-equivalent.

## Evidence trail

- `lib/repository.ml`: unique constraint on `(client_id, version)`.
- `lib/repository.ml`: `insert_crdt_operation` handles unique violation; compares with `equivalent_operation`; otherwise `Crdt_consistency_violation`.

## Failure scenario

Two divergent ops share one dot and are both treated as valid, corrupting operation history.

## Instrumentation suggestions

- SUT-side `Always`: duplicate-dot equivalent retry returns existing server_version.
- SUT-side `Unreachable`: non-equivalent duplicate treated as success.

Status vs existing instrumentation: **missing**.

## Open Questions

None.