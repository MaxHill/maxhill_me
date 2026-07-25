---
Status: done
---

# Wire prod `VITE_` vars into golf's build

## What to build

`vps/golf/deploy.sh` runs `pnpm exec vite build` with no env vars set. Golf's source has two build-time defaults that fall back to localhost when the vars are missing:

- `apps/golf/src/features/auth/auth-client.ts` — `VITE_AUTH_URL` defaults to `http://localhost:3002`
- `apps/golf/src/db.ts` — `VITE_SYNC_URL` defaults to `http://localhost:3001/sync`

Ship a prod-values file colocated with the rest of golf's vps config, source it from the deploy script, and verify the built bundle actually references the prod URLs (not the fallbacks).

Note the port mismatch: the fallback for sync is `:3001/sync`, but `vps/sync/sync.caddy` proxies `sync.maxhill.me` to `localhost:8080`. Prod URL is `https://sync.maxhill.me/sync`; there is no port in the URL because Caddy fronts it.

## Acceptance criteria

- [ ] New file `vps/golf/golf.build.env` exists (plaintext, gitignored is fine — no secrets), containing:
  - `VITE_AUTH_URL=https://auth.maxhill.me`
  - `VITE_SYNC_URL=https://sync.maxhill.me/sync`
- [ ] `vps/golf/deploy.sh` sources `golf.build.env` before invoking `pnpm exec vite build`, so both vars are exported for the build step
- [ ] After running the deploy script locally with a stubbed rsync/ssh (or with a dry-run flag), the generated `apps/golf/dist/**` contains `auth.maxhill.me` and `sync.maxhill.me/sync` — and does *not* contain `localhost:3002` or `localhost:3001` in the shipped JS
- [ ] `docs/vps.md` "Repo layout" gains `golf.build.env` under `vps/golf/`, and the "Config convention" section (or a nearby paragraph) notes that plaintext build-time env for static apps lives alongside the encrypted runtime env for services
- [ ] `sh -n vps/golf/deploy.sh` passes

## Blocked by

None - can start immediately.
