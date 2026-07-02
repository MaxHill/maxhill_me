## Property

After `Receive_sync_response`, JS client eventually returns `Ack` before timeout.

## Evidence trail

- `sim/sut/request_broker.ml`: sends `Receive_sync_response`, then waits with timeout for `Client.Ack`.
- `sim/sut/test_client.js`: `Receive_sync_response` branch applies `db.sync(...)` then `send("Ack")`.

## Failure scenario

Broker waits forever or receives wrong message, stalling simulator timeline.

## Instrumentation suggestions

- SUT-side `Sometimes`: "sync-response-applied-and-acked" state observed.
- SUT-side `Unreachable`: protocol-violation branch after sync response.

Status vs existing instrumentation: **missing**.

## Open Questions

None.