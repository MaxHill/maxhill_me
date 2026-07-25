---
Status: done
---

# Extract `alert-on-failure` into an app-shaped deploy

## What to build

`alert-on-failure` is currently a bootstrap-time concern: `vps/bootstrap.sh` installs its systemd template, its script, and — critically — sops-decrypts its `.prod.enc.env` into `/etc/alert-on-failure/`. That decrypt step forces a chicken-and-egg with the VPS age key on first bootstrap (the VPS key doesn't exist as a sops recipient until *after* bootstrap has run).

Reshape `alert-on-failure` to look like every other app under `vps/`: bootstrap installs only the systemd unit template + the shell script (no secrets, no sops), and a separate deploy step ships and decrypts the env file. `alert-on-failure@.service` is only ever instantiated on-demand by `OnFailure=`, so the env file only needs to exist by the time the *first* service failure fires — well after the first `deploy:alert-on-failure`.

Result: `bootstrap.sh` no longer calls `sops` at all. First bootstrap succeeds cleanly on a fresh box.

## Acceptance criteria

- [ ] New directory `vps/alert-on-failure/` contains `alert-on-failure@.service`, `alert-on-failure.sh`, `alert-on-failure.prod.enc.env`, and a new `deploy.sh`
- [ ] Old top-level files `vps/alert-on-failure@.service`, `vps/alert-on-failure.sh`, `vps/alert-on-failure.prod.enc.env` are removed
- [ ] `vps/bootstrap.sh` installs `alert-on-failure@.service` and `alert-on-failure.sh` from their new paths, and no longer performs any `sops -d` call
- [ ] `vps/alert-on-failure/deploy.sh` rsyncs the encrypted env to `/tmp`, sops-decrypts on the box to `/etc/alert-on-failure/alert-on-failure.prod.env` (mode 600, owned appropriately), removes the tmp file; no service restart (nothing to restart)
- [ ] A `deploy:alert-on-failure` task exists in the root `mise.toml`, mirroring the shape of the existing `deploy:sync` etc.
- [ ] `bootstrap.sh` creates `/etc/alert-on-failure/` (mode 700) owned so that the deploy user can write the decrypted env into it, matching the pattern used for other app `/etc/<app>/` dirs
- [ ] `docs/vps.md` "Repo layout" section is updated to show alert-on-failure under its own directory, and the "Config convention" / "Alarms" text is adjusted to reflect that alert-on-failure is now deployed, not bootstrapped
- [ ] `sh -n vps/bootstrap.sh` and `sh -n vps/alert-on-failure/deploy.sh` both pass
- [ ] Grep confirms no remaining references to the old top-level paths

## Blocked by

None - can start immediately.
