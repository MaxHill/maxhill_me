# mise is the only task-running interface

Every app and package exposes the same four canonical tasks via mise
— `run`, `test`, `fuzz`, `deploy` — and nothing else runs tasks.
`package.json` has no `scripts` entries; there is no turbo, no
justfile, no shell aliases. pnpm remains the package manager for
installing dependencies and executing local binaries (`pnpm install`,
`pnpm exec <bin>`), but no longer defines tasks.

## Shape

At the repo root, `mise.toml` holds workspace-wide orchestration:
`dev:all` (mprocs), `deploy:<app>` (delegating to per-project
`deploy`), `test` and `fuzz` (fanning out across every project),
`bootstrap` (VPS provisioning), `setup` (one-time local dev prep like
Playwright browsers), and `generate` (plop).

Every `apps/*/mise.toml` and `packages/*/mise.toml` defines exactly
four tasks:

- **`run`** — start the local built-from-source copy. For services,
  the dev server. For libraries, the watch-mode build so downstream
  consumers pick up changes.
- **`test`** — bounded automated checks that the current version is
  self-consistent (unit tests, type-checks, `oxlint + astro check`).
- **`fuzz`** — unbounded checks. `apps/syncdb-server` wires this to the
  simulator search; everywhere else it's `echo "no-op" && exit 0`.
- **`deploy`** — publish. For apps,
  `pnpm exec tsx ../../vps/<app>/deploy.ts` (which builds inline,
  ships, and runs a remote deploy binary). For workspace libraries, a
  one-shot build — the artifact consumers pick up via `workspace:*`.

No implementation helpers. Anything a build script would previously
have carried (`build`, `check`, `sim`, `clean`) is either folded into
a canonical verb, one-off enough to belong in a runbook (`setup`
became `docs/runbooks/bootstrap-sync.md`), or invoked directly via
`pnpm exec <bin>`.

## Why

The design target is [matklad's O(1) build
file](https://matklad.github.io/2023/12/31/O(1)-build-file.html): the
number of task verbs you need to learn to work on the repo does not
grow with the number of apps or packages. Someone opening `apps/syncdb-server`
knows exactly what to type; so does someone opening
`packages/syncdb`. The interface is the same shape as
`.github/workflows/` used to enforce, but expressed in the file that
also configures the toolchain for the project.

Concretely this replaces three overlapping systems that had grown
independently:

- **turborepo** — was doing task graph + caching + filtering. The
  task graph collapsed into pnpm's own topological ordering (which
  we still use via `pnpm -r` … wait, we don't; see below); caching
  wasn't paying for itself at this repo size; filtering wasn't worth
  the config surface.
- **`package.json` scripts** — nine separate `scripts` blocks with
  overlapping-but-not-identical verbs (`build`, `dev`, `preview`,
  `clean`, `test`, `test:watch`, `docs`, `sim:*`, `astro`, …). Each
  new project reinvented the vocabulary.
- **root `pnpm` scripts** (`pnpm build`, `pnpm dev:all`, `pnpm
  generate`) — a thin shim that only existed because there had to be
  a workspace entry point somewhere.

mise already lived at the root for tool versions and env-file
loading. Extending it to own tasks removed the other two layers
without adding a new tool.

## Considered options

- **Keep turborepo.** Rejected: the task graph and remote cache pay
  for themselves in larger monorepos, but here the graph is shallow
  (each app depends on 1–3 packages) and cache hit rates are
  irrelevant on a laptop-plus-a-single-CI-target setup.
  Configuration cost > value.

- **Keep `package.json` scripts as the interface, drop mise for
  tasks.** Rejected: `package.json` scripts don't compose across the
  OCaml service (`apps/syncdb-server`), which doesn't participate in pnpm's
  script model at all beyond a token entry. mise is the only
  common denominator that spans TS/Bun/Astro/OCaml.

- **justfile.** Never introduced. Same idea as mise-for-tasks, but
  adds a second binary we'd need to bootstrap and doesn't own
  environment variables or tool versions.

- **Non-uniform verbs per project.** Rejected — this was the state
  before. The cognitive cost of "what does `dev` mean here vs there"
  outweighed any expressiveness gain from bespoke names.

- **Keep `build` as a fifth canonical verb.** Considered and
  rejected. For apps, `deploy.ts` already builds inline before
  shipping, so `build` was a duplicate entry point. For workspace
  libraries, the "built form" _is_ the deployed form (consumers pick
  up `dist/` via `workspace:*`), so `deploy` doing a one-shot build
  is semantically honest.

## Consequences

- `pnpm build` / `pnpm test` / etc. no longer work. `mise run test`
  at root fans out; `mise run test` inside a project runs just that
  one. `pnpm install` and `pnpm exec` still work — nothing about
  dependency management changed.
- Every `mise.toml` in the repo has the same four `[tasks.*]`
  entries in the same order. Diffs are readable; grep is
  well-behaved; new projects are copy-pasted from an existing one.
- Adding a project means creating one `mise.toml` with four tasks
  (three of them potentially no-ops). No matching entries in a root
  config, no turbo pipeline updates, no `pnpm --filter` bookkeeping.
- `_.path = ["./node_modules/.bin"]` was tried and rejected in
  favour of explicit `pnpm exec <bin>` in every task, so it's
  self-documenting which binaries are project-scoped.
- Deploy scripts in `vps/<app>/deploy.ts` are cwd-agnostic (they
  self-locate to repo root) so `mise run deploy` works from the
  project directory without ceremony.
- CI is currently absent (GitHub Actions was deleted alongside
  turbo; the replacement isn't decided yet). Whatever replaces it
  will call `mise run test` and `mise run deploy:<app>` and inherit
  the same interface humans use locally.
- Playwright browsers don't auto-install with `pnpm install`
  (playwright ships no postinstall, pnpm 10 wouldn't run one
  anyway). `mise run setup` is the seam for one-time local prep;
  running it on a fresh clone is now part of the onboarding path.

## Amendments

_None yet._
