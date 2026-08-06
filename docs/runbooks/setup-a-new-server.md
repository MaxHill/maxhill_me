# Runbook — Set up a new server

End-to-end from "clicked buy on Hetzner" to "https://maxhill.me serves".
Provisioning happens _before_ the DNS switch. The box is built. Caddy
retries ACME in the background. DNS lands. Everything resolves. Plan for 20
to 40 minutes of hands-on time. Most of that is waiting.

Prerequisites (do these once, not per-server):

- The laptop age key exists at `~/.config/sops/age/keys.txt`. Its pubkey is
  a recipient in `.sops.yaml`.
- The `.prod.enc.env` files under `vps/` are populated. Sanity-check with
  `sops -d vps/<app>/<app>.prod.enc.env`.
- The Resend account has a verified sending domain. The SPF and DKIM DNS
  records are live. The API key is in
  `vps/alert-on-failure/alert-on-failure.prod.enc.env`.
- Docker Desktop is installed and running on the laptop. `deploy:sync`
  needs it. See ADR 0003.
- SSH access as `ubuntu` user is configured (Hetzner default).

---

## 1. Order the box

Order a Hetzner CX22. Ubuntu 24.04. x86_64. Region Helsinki (`hel1`).
Attach the laptop SSH pubkey (`~/.ssh/id_ed25519.pub`) at server-creation.
Hetzner plants the key in `/home/ubuntu/.ssh/authorized_keys` before first
boot. `bootstrap.sh` clones the key into the `deploy` user home directory.
Copy the box IPv4 **and** IPv6 addresses from the Hetzner console. Hetzner
assigns both automatically.

## 2. Point mise at the raw IP

DNS is not live yet. `VPS_HOST=maxhill.me` will not resolve. Override
per-laptop with a gitignored file:

```bash
cat > mise.local.toml <<EOF
[env]
VPS_HOST = "<IPV4>"
EOF
```

Sanity check: `ssh ubuntu@$VPS_HOST 'uname -a'` should print the box kernel.

## 3. Bootstrap

```bash
mise run bootstrap
```

This rsyncs `vps/` to `/opt/bootstrap/vps/`. It runs `bootstrap.sh` as
root. That installs apt packages, installs sops, creates the `deploy` user,
hardens sshd, installs systemd units, installs Caddy site configs, and
creates `/opt/<app>/` and `/etc/<app>/` skeletons. The script is
idempotent. You can re-run it any time.

The last line of the output is the freshly-generated box age pubkey. Copy
it.

## 4. Add the VPS as a sops recipient

```bash
# Append the box pubkey to the age: list in .sops.yaml
# (comma-separated after the existing laptop key).
$EDITOR .sops.yaml

# Re-wrap every encrypted file against the new recipient set.
find vps -name '*.prod.enc.env' -exec sops updatekeys -y {} \;

git add .sops.yaml vps/**/*.prod.enc.env
git commit -m "sops: add new VPS as recipient"
```

Only the wrapped data keys change. The encrypted payload does not. Diffs
stay small.

## 5. Point DNS

At the registrar, add four records. The apex and the wildcard, each in both
families:

| Name           | Type | Value    |
| -------------- | ---- | -------- |
| `maxhill.me`   | A    | `<IPV4>` |
| `maxhill.me`   | AAAA | `<IPV6>` |
| `*.maxhill.me` | A    | `<IPV4>` |
| `*.maxhill.me` | AAAA | `<IPV6>` |

The wildcard covers every subdomain the box serves (`auth`, `sync`, `golf`,
and any future app added via `docs/runbooks/add-app.md`). No per-app DNS
work is needed after this. The apex needs its own record. Wildcards do not
match the bare domain.

Wait for propagation. All four must resolve before you continue:

```bash
dig +short A    maxhill.me
dig +short AAAA maxhill.me
dig +short A    auth.maxhill.me
dig +short AAAA auth.maxhill.me
```

Caddy has retried ACME the whole time. As soon as DNS resolves, Caddy
obtains Let's Encrypt certs in the background. Watch it succeed:

```bash
ssh ubuntu@$VPS_HOST 'journalctl -u caddy -n 30 --no-pager'
```

Look for `certificate obtained successfully` lines per hostname.

## 6. Switch mise back to the hostname

```bash
rm mise.local.toml
```

`VPS_HOST=maxhill.me` (from the root `mise.toml`) now resolves to the box.
From here on, every deploy uses the friendly name.

## 7. First deploys

Run in this order. Cheapest and lowest-risk first. A broken TLS setup
surfaces before you are deep in an OCaml container build:

```bash
mise run deploy:site               # static, fastest smoke test
curl -I https://maxhill.me         # expect 200 and an LE cert

mise run deploy:alert-on-failure   # install the failure hook and creds
ssh ubuntu@$VPS_HOST \
  'systemd-run --unit=alert-smoketest-$$ /bin/false'
# expect an email within a minute

mise run deploy:golf               # static and VITE_* build-time env
curl -I https://golf.maxhill.me

mise run deploy:auth               # Bun-compiled service
ssh deploy@$VPS_HOST systemctl is-active auth.service
curl -I https://auth.maxhill.me

mise run deploy:sync               # slow the first time (about 5 to 10
                                   # minutes on Apple Silicon: Docker
                                   # builder image, amd64 emulation, and
                                   # opam deps install). See ADR 0003.
ssh deploy@$VPS_HOST 'file /opt/syncdb-server/current/syncdb-server-exe'
# expect: ELF 64-bit LSB ... x86-64 ...
ssh deploy@$VPS_HOST systemctl is-active syncdb-server.service

mise run deploy:litestream         # ships /etc/litestream.yml + R2 creds
ssh deploy@$VPS_HOST 'systemctl is-active litestream.service'
ssh deploy@$VPS_HOST 'journalctl -u litestream -n 30 --no-pager'
# expect recurring "replica sync" lines for auth.db + sync.db
```

## 8. Verify

Full sweep:

```bash
ssh deploy@$VPS_HOST 'systemctl --failed --no-legend'   # expect empty
ssh deploy@$VPS_HOST 'systemctl is-active caddy litestream.service syncdb-server.service auth.service auth-sweep.timer'
```

Confirm each subdomain serves over HTTPS with a **Let's Encrypt** cert (not
the Caddy internal CA). A browser padlock is the easiest check.

Confirm the `deploy` user narrow sudo works, and nothing else does:

```bash
ssh deploy@$VPS_HOST 'sudo -l'                             # a list of allowed lines
ssh deploy@$VPS_HOST 'sudo /bin/systemctl restart syncdb-server.service'   # succeeds
ssh deploy@$VPS_HOST 'sudo /bin/systemctl restart caddy'          # succeeds (reload path)
ssh deploy@$VPS_HOST 'sudo apt-get update'                        # refused
```

## 9. Confirm the sops-recipient commit is pushed

Step 4 committed `.sops.yaml` and the re-wrapped enc files. Push it now if
you have not:

```bash
git push
```

Anyone else who clones the repo now inherits an env where the VPS can
decrypt every enc file during deploy.

---

## If it goes wrong

- **`ssh ubuntu@$VPS_HOST` refuses** — the SSH key was not attached at
  server-creation. Fix it via the Hetzner console (rescue mode or reset the
  root password). Rerun step 1.
- **Bootstrap fails on the sops-decrypt step** — the VPS age key is not a
  recipient in `.sops.yaml` (step 4 was missed). Note: bootstrap does not
  decrypt anything. This failure comes from a deploy. Fix: run
  `sops updatekeys`. Redeploy the affected app.
- **The `caddy` unit is `activating (auto-restart)` for a long time** —
  ACME cannot reach the box on port 80 or 443. Check that DNS resolves
  (`dig +short <host>`). Then run `ssh ubuntu@$VPS_HOST 'ufw status'`.
  Bootstrap opens 80 and 443. Check anyway. The journals under
  `journalctl -u caddy` show the ACME error verbatim.
- **`deploy:sync` fails inside the container** — Docker is not running, or
  the first-time opam install timed out. Re-run. The opam state is cached
  in `maxhill-sync-opam-cache`, so the retry is fast. See ADR 0003.
- **`deploy:sync` succeeds but the service will not start** — run
  `journalctl -u syncdb-server.service -n 50` on the box. The cause is usually a bad
  env value in `vps/syncdb-server/syncdb-server.prod.enc.env`. Run `sops edit` to fix it.
  Then run `mise run deploy:sync` again.
- **`deploy:litestream` fails with permission errors under `/etc`** —
  bootstrap likely did not run after a script change. Re-run
  `mise run bootstrap`, then `mise run deploy:litestream`.
- **`litestream.service` starts but no `replica sync` logs appear** — check
  `/etc/litestream/litestream.prod.env` contains valid
  `CF_ACCOUNT_ID`, `R2_ACCESS_KEY`, and `R2_SECRET_KEY`. Then restart:
  `sudo systemctl restart litestream.service`.
- **An HTTP endpoint returns 502** — Caddy is up but the upstream is not.
  Run `systemctl status <app>.service` on the box. Check that the
  configured port matches the `reverse_proxy localhost:<port>` line in
  `vps/<app>/<app>.caddy`.

---

## What this does not cover

- Rebuilding an existing box in place after config drift — re-run
  `mise run bootstrap`. It is idempotent.
- Migrating to a new box (rotate the IP, keep the data) — follow this
  runbook for bootstrap/deploy, then restore DBs with
  `docs/runbooks/restore-databases.md`.
- Rolling back a bad deploy — see `docs/vps.md` § Rollback.
