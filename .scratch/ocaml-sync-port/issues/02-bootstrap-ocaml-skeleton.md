---
Status: ready-for-agent
---

# Bootstrap OCaml project skeleton at `apps/sync/`

## Parent

`.scratch/ocaml-sync-port/PRD.md`

## What to build

Create the empty OCaml project skeleton at `apps/sync/`, integrated with the pnpm/turbo monorepo via a conventional `package.json` whose scripts shell out to `dune`. The binary built by this slice is a hello-world that prints to stdout and exits — no HTTP, no DB, no logic. The point is to prove the OCaml toolchain, the per-project opam switch, and the turbo wiring are all working end-to-end.

Project layout follows the decisions in the PRD: per-project local opam switch (`_opam/`, gitignored), `dune-project`, a generated `sync.opam` committed to the repo, flat `lib/` (empty in this slice), `bin/main.ml` as the entrypoint, and `.gitignore` for `_opam/` and `_build/`.

The `sync.opam` file should declare the full dependency set the later slices will need (eio_main, piaf, caqti, caqti-driver-sqlite3, caqti-eio, yojson, ppx_yojson_conv, jose, logs, fmt) pinned to a compatible OCaml 5.x compiler. This way the toolchain bootstrap happens once, not slice-by-slice.

## Acceptance criteria

- [ ] `apps/sync/dune-project` exists declaring the project name `sync`
- [ ] `apps/sync/sync.opam` exists declaring the runtime dependencies (eio_main, piaf, caqti, caqti-driver-sqlite3, caqti-eio, yojson, ppx_yojson_conv, jose, logs, fmt) on OCaml 5.x
- [ ] `apps/sync/package.json` exposes at minimum `build` (runs `dune build`) and `dev` (runs the built binary)
- [ ] `apps/sync/.gitignore` excludes `_opam/` and `_build/`
- [ ] `apps/sync/bin/main.ml` is a hello-world that prints a recognizable startup message and exits
- [ ] `apps/sync/bin/dune` declares the executable correctly
- [ ] `cd apps/sync && opam switch create . 5.x --deps-only -y` (or equivalent) creates the local switch and installs deps
- [ ] `pnpm --filter sync build` succeeds
- [ ] `pnpm --filter sync dev` runs the hello-world binary
- [ ] Turbo picks up the workspace without errors

## Blocked by

`.scratch/ocaml-sync-port/issues/01-rename-sync-to-sync-go.md`
