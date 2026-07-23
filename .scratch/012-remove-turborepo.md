# Remove Turborepo

## Goal

Delete turborepo from the monorepo. Replace with plain `pnpm -r` + `--filter`. Also delete the GitHub Actions workflow (CI moving elsewhere, tracked separately).

## Decisions

- **Replacement:** `pnpm -r` recursive scripts with topological ordering (pnpm's default). No new orchestrator.
- **docs task:** drop entirely. `packages/components` `docs` script is already an alias for `build`; fold it in.
- **CI cache:** N/A — GHA workflow is being deleted.
- **Root `dev`:** drop. `dev:all` (mprocs) is the sole dev entrypoint.
- **GHA:** delete `.github/workflows/ci-and-deploy.yml`.

## Inventory (what references turbo today)

- `turbo.json` — root config
- `.turbo/` — local cache dir
- `package.json` — 7 scripts (`build`, `dev`, `check`, `lint`, `test`, `clean`, `docs`) + `turbo` devDep
- `.github/workflows/ci-and-deploy.yml` — `.turbo` cache step, `TURBO_TOKEN`/`TURBO_TEAM` env
- `README.md:111-113` — troubleshooting note
- `apps/golf/README.md:87` — `pnpm turbo build --filter=golf` example
- `.scratch/ocaml-sync-port/**` — historical planning docs; leave as-is

## Behavior gap analysis

| turbo feature | pnpm equivalent | Gap? |
|---|---|---|
| topo ordering via `dependsOn: ["^build"]` | `pnpm -r <script>` sorts topologically by default | No |
| filtering | `pnpm --filter` | No |
| local task cache | none | Yes — accept it. Repo is small; rebuilds are fast. |
| remote cache (TURBO_TOKEN) | none | Yes — accept it. |
| `persistent: true` for dev | `pnpm -r --parallel` (but we're dropping `dev`) | N/A |
| `outputs` declaration | none needed without cache | N/A |

Only real loss: task caching. Acceptable given repo size and CI removal.

## Script mapping

Root `package.json` scripts after:

```json
{
  "build":   "pnpm -r --filter=!sync --filter=!golf build",
  "check":   "pnpm -r check",
  "lint":    "pnpm -r lint",
  "test":    "pnpm -r test",
  "clean":   "pnpm -r clean",
  "dev:all": "<unchanged>",
  "generate": "plop"
}
```

Notes:
- `build` inherits the CI-era `--filter=!sync --filter=!golf` exclusions. Verify these still belong at the root level or if they should stay CI-only (they were only in CI before; locally `turbo build` built everything). **Open question — see below.**
- No root `docs` script.
- No root `dev` script.
- pnpm's `-r` runs topologically for `build`, in package order for others. That matches turbo's `dependsOn: ["^build"]` for `check`/`test` only if we set `--workspace-concurrency=1` or rely on the build having been run first. In practice `check`/`test` run after `build` in CI, and locally you build before you test. **Confirm this is acceptable** — alternative is a tiny `scripts/run.mjs` that does topo ordering for arbitrary scripts.

## Open questions to resolve during execution

1. **Should local `build` exclude `sync` and `golf`?** Previously turbo built everything locally; only CI filtered them out. Options: (a) match old local behavior — build all; (b) match CI — filter them out; (c) parametrize.
2. **`check`/`test` ordering without turbo's `^build` dep** — accept the "you must build first" convention, or add a `prebuild` pattern / small runner?

## Execution steps

1. Update root `package.json`: replace turbo scripts with `pnpm -r ...` equivalents, remove `turbo` devDep, remove `docs` script.
2. Delete `turbo.json`.
3. Delete `.turbo/` (working dir cache).
4. Delete `.github/workflows/ci-and-deploy.yml`. If it's the last workflow, also remove `.github/workflows/`.
5. Update `README.md`: remove the `turbo: command not found` troubleshooting block.
6. Update `apps/golf/README.md:87`: `pnpm turbo build --filter=golf` → `pnpm --filter=golf build`.
7. Update `.gitignore` if it lists `.turbo/`.
8. `pnpm install` to prune lockfile.
9. Smoke-test locally: `pnpm build`, `pnpm check`, `pnpm test`, `pnpm dev:all`.
10. Update `CONTEXT.md` if it mentions turbo.

## Non-goals

- Replacing GHA with a new CI system (separate effort).
- Reworking `dev:all` / mprocs.
- Touching per-package scripts.
