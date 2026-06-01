---
Status: done
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

## Comments

**Completed.**

Deviation from the PRD's original toolchain decision: incorporated mise into the toolchain per maintainer request. mise's tool registry doesn't include `ocaml` (only `opam`), so the resolution was:

- Root `mise.toml` pins `opam = "2.5.1"` (committed; tracked).
- `opam` itself manages the per-project switch and provides the OCaml compiler.
- `opam switch create . ocaml-base-compiler.5.2.0 --no-install --yes` creates `apps/sync/_opam/` with OCaml 5.2.0.
- `opam install . --deps-only` installs runtime deps from `sync.opam`.

Files created in `apps/sync/`:
- `dune-project` — declares `(name sync)` and `(generate_opam_files true)`, with the runtime dep set in a `(package)` stanza
- `sync.opam` — hand-written to break the bootstrap chicken-and-egg (opam needs it before the first `dune build` can generate it); future `dune build` runs will keep it in sync
- `.gitignore` — excludes `_opam/`, `_build/`, `*.install`
- `bin/dune` — declares `(executable (name main) (public_name sync))` (the `public_name` was needed to attach the executable to the sync package; without it `dune build` errored on an empty package)
- `bin/main.ml` — prints a recognizable startup message
- `package.json` — scripts wrap commands as `mise exec -- opam exec --switch=. -- dune ...` so they work regardless of shell-activation state

One-time machine setup that was performed:
- `mise install` (provisioned opam 2.5.1)
- `mise exec -- opam init --bare --no-setup --disable-sandboxing --yes` (initialized opam state; first time on this machine)
- `brew install pkgconf` (system dep required by `conf-pkg-config`, surfaced during opam install)

Verification performed:
- `pnpm --filter sync build` — succeeds, exit 0
- `pnpm --filter sync dev` — prints `sync (OCaml): hello from bin/main.ml — skeleton bootstrap`
- Only 6 source files are untracked under `apps/sync/`; `_opam/` (1.2G) and `_build/` correctly ignored
- Turbo workspace pickup verified implicitly (pnpm install detected the new workspace and `pnpm --filter sync` resolves to it)

Known follow-up not in scope here: the root `package.json`'s `dev:all` mprocs script no longer references the OCaml sync app. The Go renamed reference points at `sync_go`, which is correct. If the maintainer wants `mprocs` to launch the OCaml dev server in parallel during full-stack development, that's a small follow-up (add `'pnpm --filter sync dev'` to the mprocs command).
