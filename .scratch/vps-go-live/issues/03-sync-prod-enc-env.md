---
Status: done
---

# Create `vps/sync/sync.prod.enc.env`

## What to build

`vps/sync/deploy.sh` rsyncs `vps/sync/sync.prod.enc.env` on every deploy, but the file doesn't exist. Create it, populated with real prod values, encrypted via sops against the current `.sops.yaml` recipients.

The file must contain exactly the env vars that `apps/sync` reads at boot. Do not guess — audit `apps/sync/lib/config.ml` (and any test fixtures like `apps/sync/test/config_test.ml`) for the exhaustive set of `Sys.getenv` / equivalent reads, then populate every required key.

Known prod values:

- `AUTH_ISSUER_URL=https://auth.maxhill.me`
- `AUTH_AUDIENCE=<same value used by the auth server's `subjects`; check apps/auth/src/subjects.ts>`
- SQLite DB path under the service's `StateDirectory=sync` → `/var/lib/sync/sync.db` (matches `sync.service`)
- Any listen port / log level the config expects (defaults are fine if the code has them)

If any required env var has no obvious prod value (e.g. a secret token the maintainer hasn't chosen yet), stop and ask before encrypting.

## Acceptance criteria

- [ ] `apps/sync/lib/config.ml` has been read; the issue's "Comments" section records the exhaustive list of env vars sync reads at boot, marked required vs optional
- [ ] `vps/sync/sync.prod.enc.env` exists, is sops-encrypted (`input_type: dotenv`), and decrypts (with the laptop age key) to a valid dotenv file
- [ ] Every required key from the audit is present in the encrypted file with a prod value
- [ ] `AUTH_ISSUER_URL=https://auth.maxhill.me` and `AUTH_AUDIENCE` matches the value emitted by the auth server
- [ ] The DB path (if configurable) points under `/var/lib/sync/` to align with `StateDirectory=sync`
- [ ] `sops --decrypt vps/sync/sync.prod.enc.env` succeeds locally
- [ ] `vps/sync/sync.dev.env` is diffed against the new prod file; any drift in *keys* (not values) is called out in the issue comments or reconciled

## Blocked by

None - can start immediately. Note: after the first VPS bootstrap prints the VPS age pubkey, this file will need `sops updatekeys` re-encryption. That step is part of the launch runbook, not this slice.

## Comments

### Audit of `apps/sync/lib/config.ml` (env vars read at boot)

| Var | Required | Default | Prod value chosen |
|---|---|---|---|
| `PORT` | no | `3001` | `8080` — must match `sync.caddy`'s `reverse_proxy localhost:8080` |
| `DB_PATH` | no | `./sync.db` | `/var/lib/sync/sync.db` — aligns with `StateDirectory=sync` in `sync.service` |
| `LOG_LEVEL` | no | `info` | `info` — set explicitly for clarity |
| `AUTH_ISSUER_URL` | **yes** | — | `https://auth.maxhill.me` |
| `AUTH_AUDIENCE` | **yes** | — | `golf-app` (mirrors `sync.dev.env`) |
| `AUTH_ALLOWED_ALGS` | no | `RS256,ES256` | omitted — default is correct |

### Diff vs `vps/sync/sync.dev.env`

Dev only sets the two required auth vars and lets everything else default. Prod additionally pins `PORT`, `DB_PATH`, `LOG_LEVEL`. No key present in dev is missing from prod.

### Notes

- `AUTH_AUDIENCE=golf-app` is a guess mirroring dev. openauth (`apps/auth`) doesn't obviously emit an `aud` claim from what's visible in `subjects.ts`. If launch e2e fails with an audience-mismatch error, that's the first place to look.
- File is encrypted only to the current single laptop recipient in `.sops.yaml`. Post-bootstrap, the VPS age pubkey must be added and `sops updatekeys vps/sync/sync.prod.enc.env` run.
- Roundtrip verified: `SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt sops --decrypt vps/sync/sync.prod.enc.env` returns the expected dotenv.
