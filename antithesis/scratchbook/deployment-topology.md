---
sut_path: /Users/8717/code/personal/maxhill_me/apps/sync
commit: d709a5baaf9cf275b55c2999700cef24f3b71a99
updated: 2026-07-02
external_references:
  - path: /Users/8717/code/personal/maxhill_me/apps/sync
    why: User scoped research to @apps/sync/
---

## Minimal useful topology (simulator-first)

This SUT is already a harnessed single-node system: OCaml simulator process + spawned Node child + local SQLite file. No external DB/broker container required.

## Components

### `sim-client` (role: client)

- **Image source:** new Dockerfile (build OCaml + Node runtime + app code).
- **Runs:** idle entrypoint that emits `setup_complete` then sleeps; Antithesis test commands invoke simulator binaries.
- **Test template:** `/opt/antithesis/test/v1/sync-sim/`.
- **Replica count:** 1.
- **Network:** none required beyond default; all SUT communication is in-process/child-process.

### `sim-sut-run` (role: service, optional split)

- **Image source:** same build artifact as `sim-client` (can be same image).
- **Runs:** optional long-lived wrapper for scenarios needing process-fault targeting independent of command runner.
- **Replica count:** 1.
- **Network:** none required.

## Dependency containers

None for baseline simulator path.

- SQLite uses local file (`Filename.temp_file`) inside container filesystem.
- Node test client is local child process, not separate service.

## Why minimal

- Adding external Postgres/Redis/etc would not exercise code paths currently used by simulator SUT.
- Single-container baseline keeps state space low and preserves simulator determinism/replay guarantees.

## Fault requirements by property

- For recovery/lifecycle properties (`graceful-close-timeout-forces-kill`, `request-transaction-all-or-nothing` crash variants), enable **node termination** faults (disabled by default in some tenants).
- For liveness checks (`ts-client-must-ack-after-sync-response`), use either:
  - normal timeline under faults + timeout assertions, or
  - quiet periods via `ANTITHESIS_STOP_FAULTS` before terminal convergence assertions.

## SDK placement

- Workload commands in `sim-client` should include Antithesis SDK assertions (primary requirement).
- Optional SUT-side instrumentation points in OCaml sync engine for deeper branch guidance (duplicate-dot mismatch, timeout branch, force-close branch).

## Open Questions

- Keep split `sim-sut-run` container or run all commands directly in `sim-client` only; both valid, single-container is simpler.
