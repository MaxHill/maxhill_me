---
Status: done
---

# Verify + fix `vps/auth/auth.prod.enc.env`

## What to build

`vps/auth/auth.prod.enc.env` already exists but was written before the VPS shape was finalized. Audit it against what `apps/auth/src/config.ts` and `apps/auth/src/index.ts` actually read at boot, and fix any drift.

Known prod expectations:

- `ISSUER=https://auth.maxhill.me` (not `http://localhost:3002` from the dev file)
- `DB_PATH=/var/lib/auth/auth.db` (not `:memory:` — the auth server persists user records and the hourly `auth-sweep.timer` prunes expired rows, so an in-memory DB would defeat both). Path aligns with `StateDirectory=auth` in `auth.service`.
- `RESEND_API_KEY=<real prod key>` (the dev file's value may or may not be prod-appropriate — confirm with maintainer)
- Any other keys `apps/auth/src/config.ts` requires

If a required secret value isn't known (e.g. a fresh prod Resend key is needed and the maintainer hasn't provided it), stop and ask before re-encrypting.

## Acceptance criteria

- [ ] `apps/auth/src/config.ts` has been read; the exhaustive list of env vars the auth server reads is recorded in the issue's "Comments" section, marked required vs optional
- [ ] `vps/auth/auth.prod.enc.env` decrypts cleanly, contains every required key, and every value is a valid prod value (no `localhost`, no `:memory:`, no obvious dev sentinels)
- [ ] `ISSUER=https://auth.maxhill.me` in the decrypted file
- [ ] `DB_PATH` points to a file under `/var/lib/auth/` (aligned with `StateDirectory=auth`)
- [ ] `RESEND_API_KEY` is confirmed with the maintainer to be the prod key
- [ ] File is re-encrypted with sops against current `.sops.yaml` recipients
- [ ] `sops --decrypt vps/auth/auth.prod.enc.env` succeeds locally
- [ ] `vps/auth/auth.dev.env` is diffed against the new prod file; any drift in *keys* (not values) is called out in the issue comments or reconciled

## Blocked by

None - can start immediately. Note: after the first VPS bootstrap prints the VPS age pubkey, this file will need `sops updatekeys` re-encryption as part of the launch runbook.

## Comments

### Audit of `apps/auth/src/config.ts` (env vars read at boot)

| Var | Required | Prod value present | Notes |
|---|---|---|---|
| `ISSUER` | **yes** | `https://auth.maxhill.me` | ✓ |
| `DB_PATH` | **yes** | `/var/lib/auth/auth.db` | ✓ aligns with `StateDirectory=auth` |
| `RESEND_API_KEY` | **yes** | (present) | Same key as `auth.dev.env` — confirmed with maintainer that dev and prod deliberately share one Resend key. |

### Diff vs `vps/auth/auth.dev.env`

Same set of keys in both files. Prod values differ from dev as expected (`ISSUER`, `DB_PATH`); `RESEND_API_KEY` matches by design.

### Notes

- No re-encryption performed — the existing file already contains correct prod values.
- File is currently encrypted only to the single laptop recipient in `.sops.yaml`. Post-bootstrap, the VPS age pubkey must be added and `sops updatekeys vps/auth/auth.prod.enc.env` run.
- Roundtrip verified: `SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt sops --decrypt vps/auth/auth.prod.enc.env` returns the expected dotenv.
