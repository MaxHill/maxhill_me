# Add `getHeaders` hook to syncdb sync

**Label:** ready-for-agent

## Parent

docs/prd-golf-auth.md

## What to build

Extend the `syncdb` library's sync layer to accept a `getHeaders` callback so consumers can inject custom HTTP headers (e.g. `Authorization: Bearer <token>`) into sync requests.

The builder API should accept something like `withSyncHeaders(fn: () => Promise<Record<string, string>>)`. The `Sync.sendSyncRequest()` method should call this function and merge the returned headers with the existing `Content-Type` header before making the fetch call.

If no `getHeaders` is provided, behavior is unchanged (backward compatible).

## Acceptance criteria

- [ ] `CRDTDatabaseBuilder` exposes a method to set a headers provider function
- [ ] `sendSyncRequest()` calls the provider and includes returned headers in the fetch
- [ ] When no provider is set, existing behavior is unchanged
- [ ] Unit test: custom headers are included in the outgoing request
- [ ] Unit test: missing provider does not break sync

## Blocked by

None - can start immediately
