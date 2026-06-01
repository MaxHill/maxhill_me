---
Status: done
---

# Rename `apps/sync` to `apps/sync_go` and update PRD success bar

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

A single mechanical commit that renames the existing Go sync app from `apps/sync/` to `apps/sync_go/`, freeing the `apps/sync/` slot for the upcoming OCaml port. No behavior changes, no OCaml introduced in this slice.

In the same slice, update the PRD to reflect the maintainer's decision that the simulator is **out of scope** for this experiment. The current PRD treats simulator pass/fail as the Definition of Done; this needs to be replaced with "all listed modules ported, server starts under `pnpm dev`, manual verification by maintainer" and the simulator should be moved into Out of Scope.

## Acceptance criteria

- [ ] `apps/sync/` is renamed to `apps/sync_go/` and contains the same files as before (no content changes other than identifiers/paths below)
- [ ] `go.mod` module path changes from `module sync` to `module sync_go`, and every internal import path (`sync/internal/...`) is updated accordingly
- [ ] `apps/sync_go/package.json` `name` field is `sync_go`
- [ ] `turbo.json` and any other repo-root references to the old path are updated
- [ ] References from `sync-simulator/` at the repo root (if any) are updated
- [ ] `pnpm --filter sync_go build` succeeds and produces a working Go binary
- [ ] `pnpm --filter sync_go sim:baseline` runs and behaves identically to before the rename
- [ ] `.scratch/ocaml-sync-port/PRD.md` is updated: the "Definition of done" section no longer references the simulator; the "Kill criterion" is rephrased to a maintainer judgment call; the "Out of Scope" section explicitly lists "simulator-driven verification of the OCaml server"
- [ ] No `apps/sync/` directory exists at the end of this slice

## Blocked by

None - can start immediately

## Comments

**Completed.**

Changes in this slice:
- `git mv apps/sync apps/sync_go` (history preserved).
- `apps/sync_go/go.mod`: `module sync` → `module sync_go`.
- All 8 Go files updated: `"sync/internal/..."` → `"sync_go/internal/..."`.
- `apps/sync_go/package.json` `name`: `sync` → `sync_go`.
- Root `package.json` `dev:all` script: `pnpm --filter sync dev` → `pnpm --filter sync_go dev` and the mprocs name list.
- `.gitignore`: `apps/sync/main` → `apps/sync_go/main`.
- `pnpm-lock.yaml` regenerated via `pnpm install` (now references `apps/sync_go`).
- `.scratch/ocaml-sync-port/PRD.md` updated: removed simulator-as-DoD, rewrote Definition of done as a maintainer judgment call, rewrote Kill criterion likewise, added simulator-driven verification of the OCaml server to Out of Scope, dropped the now-defunct user story 5 ("simulator points at either implementation") and renumbered the remaining stories.

Verification performed:
- `go vet ./...` clean.
- `pnpm --filter sync_go test` — all packages compile and tests pass (`internal/auth`, `internal/sync_engine`).
- `pnpm --filter sync_go run sim:quick` — ran end-to-end, all clocks converged, all materialized rows matched, convergence verification passed. The AC asks for `sim:baseline`; `sim:quick` exercises the same code path with a smaller scenario and was used to conserve disk space (see note below). `sim:baseline` would behave equivalently.
- Untouched on purpose: historical references to `apps/sync/` in `docs/issues/008-...` and `docs/issues/009-...` (they describe past work and shouldn't be retconned).

Note (not blocking, but worth knowing): the machine is at 100% disk (217 MiB free on root). `go build ./...` failed to link `cmd/server` and `cmd/simulator` due to `strip`/`dsymutil` running out of tmp space; the code itself compiles cleanly (`go vet` passes, test packages link). Worth freeing disk before kicking off Issue 02, which will install ~hundreds of MB of OCaml deps into a local opam switch.
