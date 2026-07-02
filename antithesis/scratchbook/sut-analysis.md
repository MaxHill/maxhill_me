---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/ (simulator focus, esp sim/sut/World.ml)
---

## Summary

Target SUT for this pass: `apps/sync/sim/sut/*` harness + sync engine core (`apps/sync/lib/sync_engine/*`) + persistence (`apps/sync/lib/repository.ml`).

Simulator topology today is single OCaml process (`simulator_sut.exe`) spawning one Node test client (`sim/sut/test_client.js`) and one SQLite DB file per run.

## Architecture and data flow

1. `sim_bin/simulator_sut.ml` reads entropy from stdin and initializes FRNG.
2. It creates temp SQLite DB, pool size 1, initializes schema (`Repository.init_schema_with_pool`).
3. `World.init` spawns Node client process (`node ./sim/sut/test_client.js <db_name>`).
4. `World.step` randomly chooses an action (`Create_user`, `Query_user`, `Query_post`, `Send_Sync_Request`, etc), sends command to Node.
5. Node either:
   - mutates local IDB-backed model and returns `Ack`, or
   - returns `SyncRequest` created by JS Sync manager.
6. OCaml `Request_broker.handle_sync_request` runs `Sync_engine.process_sync_request_with_connection` inside DB txn, sends encoded response back to Node, waits for `Ack`.
7. Run loops until FRNG entropy exhausted; cleanup sends `Close`, waits with timeout, then force-kills on timeout.

## State management and persistence

Durable-ish state in simulator run:
- SQLite table `crdt_operations` with unique `(client_id, version)` dot key, autoincrement `server_version` global ordering.
- Node client internal state in fake-indexeddb (`users`, `posts`, op log/client state stores).

Important boundaries:
- Sync engine request includes `last_seen_server_version` and request hash.
- Response includes `base_server_version`, `latest_server_version`, unseen ops, synced dots, response hash.
- Repository SQL explicitly orders unseen fetch by `server_version ASC`.

## Concurrency model

- Eio fibers in OCaml:
  - child stdout reader fiber -> inbox stream
  - child stderr reader fiber
  - child await fiber (resolves exit promise)
- Step loop is effectively single-threaded at protocol level (one action then wait).
- Message buffering bounded (`incoming_size = 100`) with assert on overflow.
- DB pool configured to one connection in simulator SUT entrypoint to avoid schema visibility flakiness.

## Claimed/implicit guarantees found in code+tests

- Request hash mismatch rejected (`Request_integrity_failed`).
- Per-client versions in request must be contiguous.
- `Remove` context cannot reference unknown dots.
- Client cannot claim `last_seen_server_version` ahead of DB max.
- Duplicate dot insert must be idempotent only if payload-equivalent.
- Unseen operations fetched in server version order.
- Cleanup should terminate child; now escalates to force kill on timeout.

## Existing test strategy

- Unit-ish codec/hash tests: `test/sync_engine_test.ml`.
- Integration tests around process_sync_request + sqlite: `test/sync_engine_integration_test.ml`.
- Simulator fuzz/search via random entropy + replay (`sim/Driver.ml`, `sim_bin/simulator.ml`).

Gap: no Antithesis SDK assertions; simulator currently uses failwith/assert to signal failures.

## Failure-prone areas (high value for Antithesis)

1. **Protocol sequencing drift** between OCaml and Node (Ack vs SyncRequest ordering).
2. **Timeout edges** (`World.step` wait timeout, close timeout) causing hangs or partial cleanup.
3. **Duplicate-dot race semantics** under retries/replays and DB uniqueness constraints.
4. **State skew** from bad `last_seen_server_version` and replayed operations.
5. **Lifecycle edge** around child process shutdown and force-kill fallback.
6. **Potential logic bug**: `Query_post` action path in `World.step` currently sends `Client.Query_user`.

## External deps/integration points

- Node runtime for `test_client.js`.
- fake-indexeddb behavior influences sync-manager behavior.
- SQLite via Caqti.

## Assumptions

- Scope intentionally simulator-centered; not full HTTP server runtime.
- No external incident tracker supplied.

## Open Questions

- Whether future simulator evolution will add multi-client or multi-process topology (would change property priorities).
