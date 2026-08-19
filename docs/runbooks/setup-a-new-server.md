# Runbook — Set up a new server

Use this runbook to set up a new VPS.
Do this before you switch DNS.
Plan 20 to 40 minutes.
Most time is wait time.

## Prerequisites

Do these items once per laptop.

- Keep the laptop age key at `~/.config/sops/age/keys.txt`.
- Add the laptop public key to `.sops.yaml` recipients.
- Fill all `vps/<app>/<app>.prod.enc.env` files.
- Check a file with `sops -d vps/<app>/<app>.prod.enc.env`.
- Set up a Resend account with verified domain, SPF, and DKIM.
- Put the Resend key in `vps/alert-on-failure/alert-on-failure.prod.enc.env`.
- Install and start Docker Desktop on the laptop.
- Make sure SSH access as `ubuntu` works.

## 1. Order the VPS

1. Order a Hetzner CX22.
2. Select Ubuntu 24.04 and x86_64.
3. Select region `hel1`.
4. Attach `~/.ssh/id_ed25519.pub` at create time.
5. Copy the VPS IPv4 and IPv6 addresses.

Hetzner writes your key to `/home/ubuntu/.ssh/authorized_keys`.
Bootstrap copies that key for user `deploy`.

## 2. Set `VPS_HOST` to the raw IP

Create `mise.local.toml`:

```bash
cat > mise.local.toml <<EOF
[env]
VPS_HOST = "<IPV4>"
EOF
```

Check access:

```bash
ssh ubuntu@$VPS_HOST 'uname -a'
```

## 3. Bootstrap the box

```bash
mise run bootstrap
```

This command rsyncs `vps/` to `/opt/bootstrap/vps/`.
This command compiles and ships `vps/bootstrap-remote.ts`.
This command runs the remote binary as root.

Bootstrap installs packages and SOPS.
Bootstrap creates user `deploy`.
Bootstrap hardens SSH.
Bootstrap installs units and Caddy files.
Bootstrap creates `/opt/<app>/` and `/etc/<app>/` directories.

Bootstrap is idempotent.
You can run it again at any time.

Copy the age public key from the last output line.

## 4. Add the VPS SOPS recipient

```bash
$EDITOR .sops.yaml
find vps -name '*.prod.enc.env' -exec sops updatekeys -y {} \;
git add .sops.yaml vps/**/*.prod.enc.env
git commit -m "sops: add new VPS as recipient"
```

Only wrapped data keys change.
Encrypted payload does not change.

## 5. Set DNS records

Add these records:

| Name           | Type | Value    |
| -------------- | ---- | -------- |
| `maxhill.me`   | A    | `<IPV4>` |
| `maxhill.me`   | AAAA | `<IPV6>` |
| `*.maxhill.me` | A    | `<IPV4>` |
| `*.maxhill.me` | AAAA | `<IPV6>` |

The wildcard covers app subdomains such as `auth`, `sync`, and `golf`.
The apex needs separate records.

Wait for propagation.
Check all records:

```bash
dig +short A    maxhill.me
dig +short AAAA maxhill.me
dig +short A    auth.maxhill.me
dig +short AAAA auth.maxhill.me
```

Check Caddy cert logs:

```bash
ssh ubuntu@$VPS_HOST 'journalctl -u caddy -n 30 --no-pager'
```

Look for `certificate obtained successfully`.

## 6. Switch back to hostname

```bash
rm mise.local.toml
```

Now root `mise.toml` value `VPS_HOST=maxhill.me` should resolve.

## 7. Run first deploys

Run in this order:

```bash
mise run deploy:site
curl -I https://maxhill.me

mise run deploy:alert-on-failure
ssh ubuntu@$VPS_HOST 'systemd-run --unit=alert-smoketest-$$ /bin/false'

mise run deploy:golf
curl -I https://golf.maxhill.me

mise run deploy:auth
ssh deploy@$VPS_HOST systemctl is-active auth.service
curl -I https://auth.maxhill.me

mise run deploy:sync
ssh deploy@$VPS_HOST 'file /opt/syncdb-server/current/syncdb-server-exe'
ssh deploy@$VPS_HOST systemctl is-active syncdb-server.service

mise run deploy:litestream
ssh deploy@$VPS_HOST 'systemctl is-active litestream.service'
ssh deploy@$VPS_HOST 'journalctl -u litestream -n 30 --no-pager'
```

For `deploy:sync`, first run can take 5 to 10 minutes.
Apple Silicon uses amd64 emulation.
See ADR 0003.

For sync binary, expect `ELF 64-bit ... x86-64 ...`.
For litestream, look for recurring `replica sync` logs.

## 8. Verify services and sudo scope

```bash
ssh deploy@$VPS_HOST 'systemctl --failed --no-legend'
ssh deploy@$VPS_HOST 'systemctl is-active caddy litestream.service syncdb-server.service auth.service auth-sweep.timer'
```

Make sure all sites serve HTTPS with Let's Encrypt certs.

Check sudo scope:

```bash
ssh deploy@$VPS_HOST 'sudo -l'
ssh deploy@$VPS_HOST 'sudo /bin/systemctl restart syncdb-server.service'
ssh deploy@$VPS_HOST 'sudo /bin/systemctl restart caddy'
ssh deploy@$VPS_HOST 'sudo apt-get update'
```

`apt-get update` must fail for user `deploy`.

## 9. Push the SOPS recipient commit

```bash
git push
```

This commit lets the VPS decrypt env files on deploy.

---

## If it goes wrong

- **`ssh ubuntu@$VPS_HOST` fails**
  Check that you attached the SSH key at server creation.
  Fix key access in Hetzner console.
  Repeat from step 1.
- **Deploy fails on decrypt**
  Check that VPS age key is in `.sops.yaml` recipients.
  Run `sops updatekeys`.
  Deploy again.
- **Caddy stays in `activating (auto-restart)`**
  Check DNS resolution.
  Check `ufw status` on the box.
  Check `journalctl -u caddy`.
- **`deploy:sync` fails in container**
  Start Docker Desktop.
  Run deploy again.
  The opam cache volume is `maxhill-sync-opam-cache`.
- **`deploy:sync` succeeds but service fails**
  Check `journalctl -u syncdb-server.service -n 50`.
  Fix bad env values in `vps/syncdb-server/syncdb-server.prod.enc.env`.
  Run `mise run deploy:sync` again.
- **`deploy:litestream` fails under `/etc`**
  Run `mise run bootstrap`.
  Run `mise run deploy:litestream` again.
- **`litestream.service` starts but no sync logs**
  Check `CF_ACCOUNT_ID`, `R2_ACCESS_KEY`, and `R2_SECRET_KEY`.
  Restart with `sudo systemctl restart litestream.service`.
- **HTTP endpoint returns 502**
  Check `systemctl status <app>.service`.
  Check configured port in `vps/<app>/<app>.caddy`.

---

## Out of scope

- Rebuild an existing box after drift.
  Use `mise run bootstrap`.
- Move to a new box and restore data.
  Use this runbook, then use `docs/runbooks/restore-databases.md`.
- Roll back a bad deploy.
  See rollback section in `docs/vps.md`.
