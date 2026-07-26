# VPS

Everything about how apps get onto the box.

- **One VPS** (Hetzner CX22), Ubuntu, Caddy for TLS, systemd for
  process management, no Docker.
- **Four apps** — `sync` and `auth` are long-running services (OCaml
  and Bun-compiled binaries); `site` and `golf` are static (Astro and
  a PWA).
- **One helper**, `alert-on-failure` — a systemd `@.service` template
  that emails via Resend when any service enters a failed state.
  Shaped like every other app: unit installed by bootstrap, script
  and env shipped by `deploy.sh`.
- **Two users on the box**: `root` (runs `bootstrap.sh`), and `deploy`
  (runs every deploy, with narrow sudo grants for restarting the two
  services and reloading Caddy — nothing else).

---

## Repo layout

```
/vps/
  bootstrap.sh                     idempotent, root, runs on every re-provision
  Caddyfile                        → /etc/caddy/Caddyfile
  journald-retention.conf          → /etc/systemd/journald.conf.d/retention.conf
  sudoers.deploy                   → /etc/sudoers.d/deploy  (hand-written)
  alert-on-failure/
    alert-on-failure@.service      → /etc/systemd/system/
    alert-on-failure.sh            shipped to /opt/alert-on-failure/current/
    alert-on-failure.prod.enc.env  decrypted on box to /etc/alert-on-failure/
    deploy.sh                      hand-written, run from laptop
  sync/
    sync.service                   → /etc/systemd/system/
    sync.caddy                     → /etc/caddy/sites/
    sync.prod.enc.env              decrypted to /etc/sync/sync.prod.env
    (sync.dev.env — gitignored, plaintext)
    deploy.sh                      hand-written, run from laptop
  auth/                            same shape as sync
  site/
    site.caddy                     → /etc/caddy/sites/
    deploy.sh
  golf/
    golf.caddy                     → /etc/caddy/sites/
    golf.build.env                 build-time VITE_* vars (public URLs, plaintext)
    deploy.sh
```

Every file that ships to a fixed destination is **copied** by
`bootstrap.sh`. No stow, no symlinks (except the atomic `current` swap
under `/opt/<app>/`, done by the deploy script).

---

## Build paths per app

- **`sync`** (OCaml) — cross-built inside a Docker container
  pinned to `ocaml/opam:ubuntu-24.04-ocaml-5.2`, targeting
  linux/amd64. `vps/sync/deploy.sh` builds the image on first run
  and caches opam state in a named volume
  (`maxhill-sync-opam-cache`). Requires Docker on the machine
  running `mise run deploy:sync`; on Apple Silicon the build is
  emulated. Rationale: ADR 0003.
- **`auth`** (Bun) — `bun build --compile --target=bun-linux-x64`
  on the host. No container.
- **`site`** (Astro) and **`golf`** (Vite/PWA) — static builds
  on the host, rsync'd.

---

## Commands

| Action                           | Command                             |
| -------------------------------- | ----------------------------------- |
| Set up a new box (first-ever)    | `docs/runbooks/setup-a-new-server.md` |
| Re-provision an existing box     | `mise run bootstrap`                |
| Deploy one app                   | `mise run deploy:<app>`             |
| Rollback (by hand)               | `ssh` + re-point symlink            |
| Add an app                       | `docs/runbooks/add-app.md`          |
| Remove an app                    | `docs/runbooks/remove-app.md`       |
| Edit secrets & config            | `docs/runbooks/edit-secrets.md` |

There is no `deploy:all` — you rarely want it. Chain them if you do:
`mise run deploy:sync && mise run deploy:auth`.

---

## Config convention

Every service with secrets ships a sops-encrypted **dotenv** file in
the repo. On the box, the deploy script decrypts it to
`/etc/<app>/<app>.prod.env`, mode 600. The systemd unit loads it with
`EnvironmentFile=`, and the binary reads its config from
`process.env` / `Sys.getenv` — no config-path argument, no JSON parser,
no `LoadCredential=` dance.

`EnvironmentFile=` is read by systemd (PID 1, root) *before* it spawns
the service and drops to the transient uid, so the file stays
`root:root 600` even with `DynamicUser=yes`. The transient uid never
needs read on it.

Two files per app that has secrets:

- `<app>.prod.enc.env` — committed, sops-encrypted (`input_type: dotenv`)
  against both the laptop and VPS age recipients. Decrypted on the box
  during deploy to `/etc/<app>/<app>.prod.env`.
- `<app>.dev.env` — gitignored, plaintext, per-machine. Same keys as
  the encrypted file.

Dev and prod hit the same code path — only the env source differs.
For dev, `mise` auto-loads `vps/<app>/<app>.dev.env` via
`[env]._.file` in each app's `mise.toml`. Run `mise run dev:<app>`
from anywhere in the repo, or `cd apps/<app> && mise run dev`.

**Static apps with build-time env** (`golf`): Vite inlines `VITE_*`
vars into the built bundle. Prod values live in
`vps/<app>/<app>.build.env` — plaintext, committed, no secrets
(build-time env for static apps is public URLs by construction).
The deploy script sources it before `vite build`.

---

## Secrets (sops + age)

Two age keypairs, both listed as recipients in `.sops.yaml`:

- **Laptop keypair** — lets you edit every `.prod.enc.json`.
- **VPS keypair** — generated by `bootstrap.sh` at `/etc/sops/key.txt`,
  never leaves the box. Lets the box decrypt during deploy / bootstrap.

**Rotating a prod secret**: `sops edit vps/<app>/<app>.prod.enc.env`,
commit, redeploy the affected app.

**Rotating a dev secret**: edit the plaintext `.dev.env`. Done.

**After first `mise run bootstrap`**: the box prints its public age
key. Add it to `.sops.yaml` recipients and re-encrypt every
`.prod.enc.env`.

---

## Prerequisites

One setup step that lives outside this repo:

- **Resend account** — sending domain verified, SPF/DKIM DNS records in
  place, API key issued. The key + `from` and `to` addresses go into
  `vps/alert-on-failure/alert-on-failure.prod.enc.env` before the
  first `mise run deploy:alert-on-failure`.

---

## Operational concerns

### SSH

Hetzner installs the SSH key attached at server-creation time into
`/root/.ssh/authorized_keys` before first boot. `bootstrap.sh` clones
that file into `/home/deploy/.ssh/authorized_keys` so the same laptop
key works for both `root` (bootstrap, break-glass) and `deploy`
(every routine deploy). Bootstrap also installs
`/etc/ssh/sshd_config.d/10-maxhill.conf` disabling password and
keyboard-interactive auth, and restricting root to key-only.

### Logs

`journald` captures every unit's output. Query with
`journalctl -u <app> --since ...`. Retention capped at 500M via
`journald-retention.conf`.

### Alarms

- **Service-level**: `OnFailure=alert-on-failure@%n.service` on every
  service unit — email via Resend. Same Resend account as product
  email, no separate webhook service. `alert-on-failure` follows the
  standard shape: `bootstrap.sh` installs the `@.service` template;
  `mise run deploy:alert-on-failure` ships the shell script (to
  `/opt/alert-on-failure/current/`) and the Resend credentials env
  file. Note: on a crash-loop, systemd triggers `OnFailure=` once per
  restart cycle within `StartLimitBurst=` (default 5), so a
  hard-failing service produces up to 5 emails before systemd gives
  up on it. Left as-is: the redundancy is cheap and email is not
  perfectly reliable. Revisit if it becomes noisy in practice.
- **Box-level** (deferred): external dead-man's-switch
  (healthchecks.io) — a down box can't alert on itself. Add when the
  box has been live long enough to warrant it.

### Backups (deferred)

Litestream streaming each SQLite DB's WAL to Backblaze B2. Add when
there's data on the box worth losing sleep over. Sketch:

- `apt-get install litestream` step in `bootstrap.sh`.
- One `<app>-litestream.service` per DB, under the app's `vps/<app>/`
  dir. Same install pattern.
- B2 credentials go into the relevant app's `.prod.enc.env`.
- Confirm each service app opens SQLite with `PRAGMA journal_mode=WAL`.

### Rollback

`ssh deploy@$VPS_HOST`, then:

```bash
ln -sfn /opt/<app>/releases/<old-sha> /opt/<app>/current.tmp
mv -Tf /opt/<app>/current.tmp /opt/<app>/current
sudo /bin/systemctl restart <app>.service   # service apps only
```

### Load management

Per-unit systemd caps: `MemoryMax=` (set), `CPUQuota=` (add if needed).
Caddy rate limiting and per-service concurrency caps: add when
saturation actually happens.

---

## Why this shape

- **SQLite + long-running processes** need persistent disk and real
  processes — rules out serverless.
- **Owned VPS** is cheapest and gives full control; no multi-region
  need to justify a PaaS.
- **Caddy** removes the TLS toil without adding an orchestration layer.
- **No Docker on the box** — OCaml binaries are self-contained, Bun
  compiles to a self-contained binary, and static sites are just
  files. The one exception is *build-time*: `apps/sync` is
  cross-built via a Docker image (`vps/sync/Dockerfile.builder`)
  because Mac→Linux OCaml cross-compile isn't viable today (see
  ADR 0003). The VPS itself still runs plain ELFs under systemd.
- **No manifest, no `kind` enum, no per-kind dispatch code** — four
  apps means four hand-written `deploy.sh` files. Duplication at N=4
  is cheaper than the abstraction it would take to remove it.
- **One `deploy.sh` per app** because the interesting differences
  (build command, artifact path, restart-or-not, config-or-not) are
  per-app anyway. When two scripts drift, that's information.
- **Config-file arg** everywhere replaced by `EnvironmentFile=`: same
  dev/prod code path, secrets never bake into artifacts, no per-app
  JSON parser at startup, and the transient uid never needs to read
  the config file itself.
- **sops + age** because it's git-versioned, has no daemon, and
  matches the systemd + Caddy philosophy.
- **Narrow sudo** because the `deploy` user should be unable to escalate
  beyond restarting known services. Editing that set = re-run bootstrap.
