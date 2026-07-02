---
Status: ready-for-agent
---

# PRD: Deliver sync response back to simulator client

## Problem Statement

As a maintainer working on the sync simulator, I can currently generate client-side sync requests and process them on the server side, but the simulated client does not receive and apply the resulting sync response through the OCaml simulator world loop. This leaves the simulation with a broken round-trip: request generation exists, server processing exists, but response delivery/application is missing in the same flow. That gap prevents realistic end-to-end validation of sync behavior and hides bugs that only appear when responses are consumed by the client state machine.

## Solution

Implement full sync round-trip behavior in the simulator world: when a simulated client emits a sync request, the world processes it via the sync engine and then immediately delivers the sync response back to that same client, where the client applies it through its sync-response handler.

The first delivery mode is intentionally minimal and immediate (no delay queue, no packet loss, no corruption simulation yet). Errors are fail-fast in both world and client process so correctness bugs surface early.

## User Stories

1. As a simulator maintainer, I want each generated sync request to produce a delivered sync response, so that the loop models a real client-server sync exchange.
2. As a simulator maintainer, I want the simulated client to apply server responses, so that local materialized state and sync metadata actually advance.
3. As a simulator maintainer, I want fail-fast behavior on sync processing errors, so that protocol or integrity regressions are visible immediately.
4. As a simulator maintainer, I want fail-fast behavior on client apply errors, so that invalid responses do not silently pass in simulation.
5. As a simulator maintainer, I want the initial protocol extension to be minimal, so that we can ship the capability quickly without speculative complexity.
6. As a simulator maintainer, I want response transport to be explicit in the world-client message contract, so that later fault-injection features have a stable foundation.
7. As a simulator maintainer, I want each client action that triggers sync to result in request + response + apply within the same run, so that simulator progress reflects real synchronization.
8. As a simulator maintainer, I want response handling to reuse existing sync manager semantics, so that simulator behavior matches production client logic.
9. As a simulator maintainer, I want hash validation and stale-response checks to execute during simulation, so that integrity and ordering issues are caught in test runs.
10. As a simulator maintainer, I want no hidden response drops in this phase, so that debugging is deterministic.
11. As a simulator maintainer, I want simulator logs to show request/response flow, so that debugging event order is straightforward.
12. As a simulator maintainer, I want response application to happen through the client’s transaction boundaries, so that behavior matches real IndexedDB sync semantics.
13. As a simulator maintainer, I want this feature to be compatible with future delayed/out-of-order response simulation, so that we can iteratively increase realism.
14. As a simulator maintainer, I want to preserve existing action generation behavior, so that this change focuses strictly on closing the response loop.
15. As a simulator maintainer, I want simulator crashes to indicate correctness failures rather than be auto-recovered, so that signal remains strong while the loop is being built.
16. As a simulator maintainer, I want manual smoke runs to prove response delivery works before further extensions, so that we have confidence in the base path.
17. As a developer debugging sync convergence, I want responses applied at each step, so that observed divergence is meaningful and actionable.
18. As a developer evolving simulator faults later, I want a clearly scoped baseline implementation now, so that future fault work is additive rather than entangled.

## Implementation Decisions

- **Protocol shape (world ↔ simulated client):** Use a minimal response-delivery message for now (sync response payload only). Do not introduce a full delivery envelope in this phase.
- **Delivery timing:** Immediate in-step delivery only. No response queue in this phase.
- **World behavior on sync-engine failure:** Fail-fast (raise/abort run) instead of logging and dropping.
- **Client behavior on apply failure:** Fail-fast (throw/process exit) instead of soft-failing.
- **Client apply mechanism:** Use the existing sync manager response-handling flow to apply server operations, update server version checkpoint, and mark local operations synced.
- **Scope boundaries:** Keep existing TODOs for delayed, dropped, and corrupted request/response simulation as future work; do not implement those now.
- **Inter-module contract update:** Extend simulator inbound message decoding to include sync-response delivery message type, and extend simulator outbound/inbound handling coherently across OCaml world and JS client process.
- **Determinism posture:** Prefer explicit execution order and no silent retries in this iteration.
- **No schema/API surface change in server domain:** Sync engine request/response types and hashing semantics remain unchanged; only simulator wiring is added.
- **Observability:** Retain/extend transport logs around world-to-client and client-to-world messages to aid smoke-debugging.

## Testing Decisions

- **Primary seam (highest existing seam):** Simulator world stepping loop observed as external behavior: request emitted by client, processed by server logic, response delivered back, response applied by client.
- **Secondary seam:** Simulated client process message protocol and sync-manager side effects (response accepted and applied).
- **Test philosophy:** Assert externally visible behavior (round-trip occurs, process fails on invalid response, state progression/log evidence), not internal implementation details (specific temporary variables or internal helper call order).
- **Validation approach chosen now:** Manual smoke run only for this PRD scope.
- **Prior art:** Existing sync engine tests for request/response correctness and integrity hashing; existing simulator harness in the Go implementation that models request/response delivery and client application cycle.
- **Future test expansion (not now):** Add simulator assertions around “response received and applied” once this baseline path is stable.

## Out of Scope

- Response delay/drop/corruption fault simulation.
- Request fault simulation changes.
- New recovery protocols for soft error handling.
- Multi-message acknowledgement or retransmission mechanisms.
- Full HTTP-style status/error envelope for simulator protocol.
- Automatic test harness expansion beyond manual smoke verification.
- Changes to sync engine core algorithms or database schema.

## Further Notes

- This PRD intentionally captures a smallest-correctness step: complete the sync request→response→apply loop first, then layer realism faults.
- Chosen error policy is deliberately strict (fail-fast) to maximize debugging signal while foundational simulator semantics are being completed.
- Once this lands, follow-on PRDs can target response queueing and network-fault injection with clearer behavioral baselines.
