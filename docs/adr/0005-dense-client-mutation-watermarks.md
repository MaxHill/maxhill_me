# Dense client mutation watermarks

Use a dense per-client mutation sequence for upload deduplication. Commit each processed prefix and its data effects atomically. Keep CRDT logical clocks separate, because remote observations can create gaps in those clocks.

The server retains one mutation watermark and logical-clock high-water mark per tenant/database/client. Row compaction does not remove them. Duplicate mutation ids never apply again, and a gap rejects the transaction. This replaces accepted-dot range history, whose size could grow with every operation.

Clients persist mutation allocation, row changes, and outbox entries in one local transaction. Acknowledgement retirement is also atomic. Failed writes abort without consuming an id. Pending work is not silently cleared on a protocol or state error.

## Consequences

- Protocol v3 and local schema v4 target fresh stores. Existing unsupported stores report migration-required without deletion or automatic conversion. Migration is deferred.
- Permanent invalid mutations block the prefix until explicit repair. No rejection is silently acknowledged as a successful write.
- Client identities must not be reused after lost or restored state. Per-client metadata grows with retained client incarnations, not operation history. Client retirement remains a separate policy.
- Old duplicate payloads are ignored, not historically reverified. The protocol does not retain an arbitrary payload archive.
