# Runbook — Set up a new server

End-to-end from "clicked buy on Hetzner" to "https://maxhill.me
serves". Provisioning happens *before* DNS is flipped — the box gets
built, Caddy chases certs in the background, DNS lands, everything
resolves. About 20–40 minutes of hands-on time; most of it waits.

Prerequisites (do these once, not per-server):

- Laptop age key exists at `~/.config/sops/age/keys.txt` and its
  pubkey is a recipient in `.sops.yaml`.
- `.prod.enc.env` files under `vps/` are populated (sanity-check with
  `sops -d vps/<app>/<app>.prod.enc.env`).
- Resend account: sending domain verified, SPF/DKIM DNS records
  live, API key inside `vps/alert-on-failure/alert-on-failure.prod.enc.env`.
- Docker Desktop installed and running locally (required by
  `deploy:sync` — see ADR 0003).

---

## 1. Order the box

Hetzner CX22, Ubuntu 24.04, x86_64, region Nuremberg (`nbg1`).
Attach the laptop's SSH pubkey (`~/.ssh/id_ed25519.pub`) at
server-creation — Hetzner plants it in `/root/.ssh/authorized_keys`
before first boot, which `bootstrap.sh` clones into `deploy`'s home
directory. Copy the box's IPv4 address from the Hetzner console.

## 2. Point mise at the raw IP

DNS isn't live yet, so `VPS_HOST=maxhill.me` won't resolve. Override
per-laptop with a gitignored file:

```bash
cat > mise.local.toml <<EOF
[env]
VPS_HOST = "<IPV4>"
EOF
```

Sanity: `ssh root@$VPS_HOST 'uname -a'` should print the box's kernel.

## 3. Bootstrap

```bash
mise run bootstrap
```

Rsyncs `vps/` to `/opt/bootstrap/vps/`, runs `bootstrap.sh` as root:
apt packages, sops install, `deploy` user, sshd hardening, systemd
units, Caddy site configs, `/opt/<app>/` + `/etc/<app>/` skeletons.
Idempotent — re-run any time.

The last line of the output is the box's freshly-generated age
pubkey. Copy it.

## 4. Add the VPS as a sops recipient

```bash
# Append the box's pubkey to the age: list in .sops.yaml
# (comma-separated after the existing laptop key).
$EDITOR .sops.yaml

# Re-wrap every encrypted file against the new recipient set.
find vps -name '*.prod.enc.env' -exec sops updatekeys -y {} \;

git add .sops.yaml vps/**/*.prod.enc.env
git commit -m "sops: add new VPS as recipient"
```

Only the wrapped data keys change; the encrypted payload doesn't,
so diffs stay small.

## 5. Point DNS

At the registrar, two A records:

| Name           | Type | Value           |
| -------------- | ---- | --------------- |
| `maxhill.me`   | A    | `<IPV4>`        |
| `*.maxhill.me` | A    | `<IPV4>`        |

The wildcard covers every subdomain the box serves (`auth`, `sync`,
`golf`, plus any future app added via `docs/runbooks/add-app.md`) —
no per-app DNS work forever after. The apex needs its own record
because wildcards don't match the bare domain.

Wait for propagation. Both must return the box's IPv4 before
continuing:

```bash
dig +short maxhill.me
dig +short auth.maxhill.me
```

Caddy has been retrying ACME the whole time — as soon as DNS
resolves, it obtains Let's Encrypt certs in the background. Watch
it succeed:

```bash
ssh root@$VPS_HOST 'journalctl -u caddy -n 30 --no-pager'
```

Look for `certificate obtained successfully` lines per hostname.

## 6. Flip mise back to the hostname

```bash
rm mise.local.toml
```

`VPS_HOST=maxhill.me` (from the root `mise.toml`) now resolves to the
box. From here on out every deploy uses the friendly name.

## 7. First deploys

Run in this order — cheapest and lowest-risk first, so a broken TLS
setup surfaces before you're deep into an OCaml container build:

```bash
mise run deploy:site               # static, fastest smoke test
curl -I https://maxhill.me         # expect 200 + LE cert

mise run deploy:alert-on-failure   # install the failure hook + creds
ssh root@$VPS_HOST \
  'systemd-run --unit=alert-smoketest-$$ /bin/false'
# → expect an email within a minute

mise run deploy:golf               # static + VITE_* build-time env
curl -I https://golf.maxhill.me

mise run deploy:auth               # Bun-compiled service
ssh deploy@$VPS_HOST systemctl is-active auth.service
curl -I https://auth.maxhill.me

mise run deploy:sync               # slow first time (~5–10 min on
                                   # Apple Silicon: Docker builder
                                   # image + amd64 emulation + opam
                                   # deps install). See ADR 0003.
ssh deploy@$VPS_HOST 'file /opt/sync/current/sync-exe'
# → expect: ELF 64-bit LSB … x86-64 …
ssh deploy@$VPS_HOST systemctl is-active sync.service
```

## 8. Verify

Belt-and-braces sweep:

```bash
ssh deploy@$VPS_HOST 'systemctl --failed --no-legend'   # expect empty
ssh deploy@$VPS_HOST 'systemctl is-active caddy sync.service auth.service auth-sweep.timer'
```

Confirm each subdomain serves over HTTPS with a **Let's Encrypt**
cert (not Caddy's internal CA — a browser padlock is the easiest
check).

Confirm the `deploy` user's narrow sudo works and nothing else does:

```bash
ssh deploy@$VPS_HOST 'sudo -l'                             # → list of allowed lines
ssh deploy@$VPS_HOST 'sudo /bin/systemctl restart sync.service'   # → succeeds
ssh deploy@$VPS_HOST 'sudo /bin/systemctl restart caddy'          # → succeeds (reload path)
ssh deploy@$VPS_HOST 'sudo apt-get update'                        # → refused
```

## 9. Confirm the sops-recipient commit is pushed

Step 4 committed `.sops.yaml` + re-wrapped enc files. Push it now if
you haven't:

```bash
git push
```

Anyone else cloning the repo now inherits an env where every enc
file can be decrypted by the VPS during deploy.

---

## If it goes wrong

- **`ssh root@$VPS_HOST` refuses** — SSH key wasn't attached at
  server-creation. Fix via Hetzner console (rescue mode or reset root
  pw), rerun step 1.
- **Bootstrap fails on the sops-decrypt step** — the VPS age key
  isn't a recipient in `.sops.yaml` (step 4 missed). Wait — bootstrap
  itself doesn't decrypt anything, so this failure comes from a
  deploy. Fix: `sops updatekeys` + redeploy the affected app.
- **`caddy` unit is `activating (auto-restart)` for a long time** —
  ACME can't reach the box on port 80/443. Check DNS resolves
  (`dig +short <host>`), then `ssh root@$VPS_HOST 'ufw status'` —
  bootstrap opens 80/443, but check anyway. Journals under
  `journalctl -u caddy` give the ACME error verbatim.
- **`deploy:sync` fails inside the container** — Docker not running,
  or first-time opam install timed out. Re-run; opam state is cached
  in `maxhill-sync-opam-cache` so the retry is fast. See ADR 0003.
- **`deploy:sync` succeeds but the service won't start** —
  `journalctl -u sync.service -n 50` on the box. Usually a bad env
  value in `vps/sync/sync.prod.enc.env`; `sops edit` to fix, then
  `mise run deploy:sync` again.
- **Any HTTP endpoint returns 502** — Caddy is up but the upstream
  isn't. `systemctl status <app>.service` on the box; check its
  configured port matches the `reverse_proxy localhost:<port>` line
  in `vps/<app>/<app>.caddy`.

---

## What this doesn't cover

- Rebuilding an existing box in-place after config drift — just re-run
  `mise run bootstrap`, it's idempotent.
- Migrating to a new box (rotate IP, keep data) — future runbook when
  Litestream backups exist. Today: back up `/opt/sync/*.db` manually,
  follow this runbook against the new box, restore the DB, redeploy.
- Rolling back a bad deploy — see `docs/vps.md` § Rollback.
