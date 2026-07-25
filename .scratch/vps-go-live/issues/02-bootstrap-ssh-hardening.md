---
Status: done
---

# Harden bootstrap: clone root SSH keys into `deploy` + sshd drop-in

## What to build

Two related gaps in `vps/bootstrap.sh`:

1. The `deploy` user is created but has no `~/.ssh/authorized_keys`. Every `vps/<app>/deploy.sh` immediately `ssh deploy@$VPS_HOST …`, so after the first bootstrap no deploy can happen.
2. `sshd` is left at Hetzner image defaults. We want explicit, belt-and-braces hardening — password auth off, keyboard-interactive off, root login key-only.

Fix both in `bootstrap.sh` so a freshly-provisioned box is deploy-ready and hardened as soon as the script exits.

## Acceptance criteria

- [ ] After `useradd deploy`, `bootstrap.sh` ensures `/home/deploy/.ssh/` exists (`deploy:deploy 700`) and copies `/root/.ssh/authorized_keys` to `/home/deploy/.ssh/authorized_keys` (`deploy:deploy 600`). Idempotent — re-running never widens perms or duplicates keys.
- [ ] `bootstrap.sh` installs `/etc/ssh/sshd_config.d/10-maxhill.conf` (mode 644) containing exactly: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `KbdInteractiveAuthentication no`. File lives in the repo at `vps/sshd-hardening.conf` and is `install`ed like the other config files.
- [ ] After installing the drop-in, `bootstrap.sh` runs `sshd -t` (config test — fail loud) and `systemctl reload ssh` (Ubuntu unit name).
- [ ] Re-running `bootstrap.sh` on an already-provisioned box is a no-op for both changes.
- [ ] `docs/vps.md` "Why this shape" or "Operational concerns" gains a one-line note that sshd is hardened by bootstrap and that Hetzner-uploaded root keys are cloned to `deploy` on first run.
- [ ] `sh -n vps/bootstrap.sh` passes.

## Blocked by

None - can start immediately.
