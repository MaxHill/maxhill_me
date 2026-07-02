---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Category: Sync protocol integrity

### request-hash-integrity-enforced — Reject tampered sync requests

| | |
|---|---|
| **Type** | Safety |
| **Property** | Any request whose `request_hash` does not match canonical hash is rejected. |
| **Invariant** | `Always`: assert processing returns `Request_integrity_failed` for hash-mismatch inputs. Safety semantic (must never accept tampered payload). |
| **Antithesis Angle** | Faulty/reordered/partially-corrupted message paths should not bypass hash gate. |
| **Why It Matters** | Prevents applying corrupted or forged ops into durable log. |

**Open Questions:** None

### client-cannot-claim-future-server-version — Reject ahead-of-server cursor

| | |
|---|---|
| **Type** | Safety |
| **Property** | Request `last_seen_server_version` must be `<=` actual max server version. |
| **Invariant** | `Always`: when last_seen > max_server, processing yields `Client_state_out_of_sync`. |
| **Antithesis Angle** | Timing + retries can create stale/invalid cursors; check validation holds under faulted interleavings. |
| **Why It Matters** | Prevents skipping unseen operations or desynchronizing client/server views. |

**Open Questions:** None

### per-client-dot-versions-are-contiguous — Reject gapped per-client version batches

| | |
|---|---|
| **Type** | Safety |
| **Property** | In one request, each client’s dot versions must advance contiguously. |
| **Invariant** | `Always`: gapped sequences fail with `Non_contiguous_versions`. |
| **Antithesis Angle** | Retries/dup drops can produce gaps; engine must fail closed. |
| **Why It Matters** | Preserves causal ordering assumptions in CRDT op log. |

**Open Questions:** None

### remove-context-only-references-known-dots — Remove context must reference known history

| | |
|---|---|
| **Type** | Safety |
| **Property** | `Remove` context entries must exist either in same request or already persisted. |
| **Invariant** | `Always`: unknown context dot fails with `Remove_context_unseen_dot`. |
| **Antithesis Angle** | Under delayed visibility/reordered ops, unknown-context removes must never apply. |
| **Why It Matters** | Prevents tombstones deleting against non-existent causal history. |

**Open Questions:** None

### duplicate-dot-must-be-equivalent — Duplicate dot is idempotent only when payload-equivalent

| | |
|---|---|
| **Type** | Safety |
| **Property** | Reusing `(client_id, version)` with different payload is rejected; equivalent retry is accepted idempotently. |
| **Invariant** | `Always`: duplicate dot with non-equivalent payload => `Crdt_consistency_violation`; equivalent duplicate returns existing server_version. |
| **Antithesis Angle** | Retry storms + partial failures frequently generate duplicates; semantic mismatch must be detected. |
| **Why It Matters** | Guards against divergent histories hidden behind same dot key. |

**Open Questions:** None

## Category: Sync response correctness

### unseen-operations-ordered-by-server-version — Returned unseen ops preserve global order

| | |
|---|---|
| **Type** | Safety |
| **Property** | Response unseen operations are ordered by ascending `server_version`. |
| **Invariant** | `Always`: decoded response op order matches DB server_version ordering. |
| **Antithesis Angle** | Concurrent inserts + failures stress ordering assumptions and replay correctness. |
| **Why It Matters** | Deterministic merge semantics depend on stable global op order. |

**Open Questions:** None

### sync-response-latest-version-monotonic — latest_server_version reflects inserted and fetched data

| | |
|---|---|
| **Type** | Safety |
| **Property** | `latest_server_version` is max of request cursor, inserted versions, and fetched unseen rows. |
| **Invariant** | `Always`: latest_server_version >= base_server_version and >= every included operation version boundary. |
| **Antithesis Angle** | Faulted interleavings around insert/fetch can expose off-by-one or stale max bugs. |
| **Why It Matters** | Wrong cursor advancement causes missed or duplicated sync data. |

**Open Questions:** None

### request-transaction-all-or-nothing — Request processing is atomic

| | |
|---|---|
| **Type** | Safety |
| **Property** | A failed sync request leaves no partial DB writes from that request. |
| **Invariant** | `Always`: on any validation/storage failure, count/state unchanged for request-scoped inserts. |
| **Antithesis Angle** | Crash/termination faults around transaction boundaries target torn writes. |
| **Why It Matters** | Partial apply corrupts op log and breaks future sync determinism. |

**Open Questions:** None

## Category: Simulator protocol/lifecycle

### ts-client-must-ack-after-sync-response — Receive_sync_response handshake completes with Ack

| | |
|---|---|
| **Type** | Liveness |
| **Property** | After broker sends `Receive_sync_response`, client eventually responds `Ack` before timeout. |
| **Invariant** | `Sometimes(cond)`: semantic state "sync response applied + acked" observed; timeout path flagged otherwise. Liveness semantic. |
| **Antithesis Angle** | Thread pauses/node throttling can delay Node event loop and expose deadlocks. |
| **Why It Matters** | Prevents silent protocol stalls between OCaml broker and JS client. |

**Open Questions:** None

### simulator-step-timeout-fails-fast — Step wait does not hang indefinitely

| | |
|---|---|
| **Type** | Safety |
| **Property** | Each step either receives expected client message or fails within configured timeout. |
| **Invariant** | `Always`: no step exceeds action timeout without explicit timeout failure signal. |
| **Antithesis Angle** | Network/process jitter can create hangs; bounded wait is required to keep exploration progressing. |
| **Why It Matters** | Prevents non-terminating timelines that waste search budget. |

**Open Questions:** None

### graceful-close-timeout-forces-kill — Cleanup escalates to force-close on graceful timeout

| | |
|---|---|
| **Type** | Safety |
| **Property** | If `Close` does not exit child within timeout, simulator force-kills and exits cleanup path. |
| **Invariant** | `AlwaysOrUnreachable`: if graceful close times out, force-close branch runs and child exits; if timeout never occurs branch may be unreachable. |
| **Antithesis Angle** | Node hang/throttle faults target shutdown recovery path. |
| **Why It Matters** | Avoids leaked child processes and hung simulator teardown. |

**Open Questions:** None

### ts-client-fatal-errors-surface-to-simulator — Node fatal exits propagate as simulator failure

| | |
|---|---|
| **Type** | Safety |
| **Property** | JS fatal paths (`CLIENT_FATAL`, unhandled rejection/exception) must terminate child and surface non-success to OCaml. |
| **Invariant** | `Always`: non-zero/signaled child exit triggers simulator failure path (not silent pass). |
| **Antithesis Angle** | Faults can trigger latent JS runtime failures; must be observable in outcome. |
| **Why It Matters** | Silent child failure would invalidate simulator signal quality. |

**Open Questions:** None

### deterministic-replay-by-seed-and-size — Replay is deterministic for fixed entropy

| | |
|---|---|
| **Type** | Safety |
| **Property** | Given same `(seed,size)` entropy stream, replay reproduces same pass/fail outcome. |
| **Invariant** | `Always`: repeated `run_once` using identical entropy yields stable result classification. |
| **Antithesis Angle** | Scheduler faults may expose hidden nondeterminism; this property finds flake sources. |
| **Why It Matters** | Reproducibility is required for debugging counterexamples. |

**Open Questions:** None

### simulator-uses-single-db-connection-for-schema-visibility — Simulator avoids multi-conn sqlite schema races

| | |
|---|---|
| **Type** | Reachability |
| **Property** | Simulator SUT path executes with pool max_size=1 configuration. |
| **Invariant** | `Reachable`: startup path confirms single-connection pool config branch is used. |
| **Antithesis Angle** | Ensures test environment actually matches intended deterministic setup. |
| **Why It Matters** | Multi-connection sqlite setup previously caused intermittent "no such table" behavior. |

**Open Questions:** None

### query-post-action-sends-query-post-command — Query_post action maps to Query_post message

| | |
|---|---|
| **Type** | Safety |
| **Property** | `World.step` must send `Client.Query_post` when action is `Query_post`. |
| **Invariant** | `Always`: action/command mapping table is identity for query actions. |
| **Antithesis Angle** | Random action exploration increases chance of hitting wrong mapping branch quickly. |
| **Why It Matters** | Wrong mapping hides post-query behavior and biases simulator coverage. |

**Open Questions:** None
