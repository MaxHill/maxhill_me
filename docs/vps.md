# VPS

How apps get onto the box.

- **One VPS** (Hetzner CX22). Ubuntu. Caddy for TLS. systemd for process
  management. No Docker.
- **Four apps** — `sync` and `auth` are long-running services (OCaml and
  Bun-compiled binaries). `site` and `golf` are static (Astro and a PWA).
- **One helper**, `alert-on-failure` — a systemd `@.service` template that
  emails via Resend when any service enters a failed state. It has the same
  shape as every other app: the unit is installed by bootstrap. The script
  and env are shipped by `deploy.sh`.
- **Three users on the box**: `ubuntu` (SSH access, runs `bootstrap.sh`),
  `root` (bootstrap), and `deploy` (runs every deploy, with narrow sudo
  grants to restart the two services and reload Caddy — nothing else).

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

`bootstrap.sh` **copies** every file that ships to a fixed destination. No
stow. No symlinks. The one exception is the atomic `current` swap under
`/opt/<app>/`. The deploy script does that.

---

## Build paths per app

- **`sync`** (OCaml) — cross-built inside a Docker container pinned to
  `ocaml/opam:ubuntu-24.04-ocaml-5.2`, targeting linux/amd64.
  `vps/sync/deploy.sh` builds the image on first run. It caches opam state
  in a named volume (`maxhill-sync-opam-cache`). Docker must run on the
  machine that runs `mise run deploy:sync`. On Apple Silicon, the build is
  emulated. Rationale: ADR 0003.
- **`auth`** (Bun) — `bun build --compile --target=bun-linux-x64` on the
  host. No container.
- **`site`** (Astro) and **`golf`** (Vite/PWA) — static builds on the host,
  then rsync.

---

## Commands

| Action                        | Command                               |
| ----------------------------- | ------------------------------------- |
| Set up a new box (first-ever) | `docs/runbooks/setup-a-new-server.md` |
| Re-provision an existing box  | `mise run bootstrap`                  |
| Deploy one app                | `mise run deploy:<app>`               |
| Rollback (by hand)            | `ssh` and re-point the symlink        |
| Add an app                    | `docs/runbooks/add-app.md`            |
| Remove an app                 | `docs/runbooks/remove-app.md`         |
| Edit secrets and config       | `docs/runbooks/edit-secrets.md`       |

There is no `deploy:all`. You rarely want it. Chain the commands if you do:
`mise run deploy:sync && mise run deploy:auth`.

---

## Config convention

Every service with secrets ships a sops-encrypted **dotenv** file in the
repo. On the box, the deploy script decrypts it to
`/etc/<app>/<app>.prod.env`, mode 600. The systemd unit loads it with
`EnvironmentFile=`. The binary reads its config from `process.env` or
`Sys.getenv`. No config-path argument. No JSON parser. No `LoadCredential=`
dance.

systemd (PID 1, root) reads `EnvironmentFile=` _before_ it spawns the
service and drops to the transient uid. The file stays `root:root 600` even
with `DynamicUser=yes`. The transient uid never needs read on it.

Two files per app with secrets:

- `<app>.prod.enc.env` — committed, sops-encrypted (`input_type: dotenv`)
  against both the laptop and VPS age recipients. The box decrypts it
  during deploy to `/etc/<app>/<app>.prod.env`.
- `<app>.dev.env` — gitignored, plaintext, per-machine. Same keys as the
  encrypted file.

Dev and prod hit the same code path. Only the env source differs. For dev,
`mise` auto-loads `vps/<app>/<app>.dev.env` via `[env]._.file` in each app
`mise.toml`. Run `mise run dev:<app>` from anywhere in the repo. Or
`cd apps/<app> && mise run dev`.

**Static apps with build-time env** (`golf`): Vite inlines `VITE_*` vars
into the built bundle. Prod values live in `vps/<app>/<app>.build.env` —
plaintext, committed, no secrets. Build-time env for static apps is public
URLs by construction. The deploy script sources the file before
`vite build`.

---

## Secrets (sops + age)

Two age keypairs. Both are listed as recipients in `.sops.yaml`:

- **Laptop keypair** — lets you edit every `.prod.enc.json`.
- **VPS keypair** — generated by `bootstrap.sh` at `/etc/sops/key.txt`. It
  never leaves the box. It lets the box decrypt during deploy and
  bootstrap.

**Rotate a prod secret**: run `sops edit vps/<app>/<app>.prod.enc.env`.
Commit. Redeploy the affected app.

**Rotate a dev secret**: edit the plaintext `.dev.env`. Done.

**After the first `mise run bootstrap`**: the box prints its public age
key. Add it to the `.sops.yaml` recipients. Re-encrypt every
`.prod.enc.env`.

---

## Prerequisites

One setup step lives outside this repo:

- **Resend account** — sending domain verified, SPF and DKIM DNS records in
  place, API key issued. The key, the `from` address, and the `to` address
  go into `vps/alert-on-failure/alert-on-failure.prod.enc.env` before the
  first `mise run deploy:alert-on-failure`.

---

## Operational concerns

### SSH

Hetzner installs the SSH key attached at server-creation time into
`/home/ubuntu/.ssh/authorized_keys` before first boot. `bootstrap.sh` clones
that file into `/home/deploy/.ssh/authorized_keys`. The same laptop key works
for `ubuntu` (SSH access, bootstrap, break-glass) and `deploy` (every routine
deploy). Bootstrap also installs `/etc/ssh/sshd_config.d/10-maxhill.conf`.
That disables password auth and keyboard-interactive auth, and restricts
root to key-only.

### Logs

`journald` captures the output of every unit. Query with
`journalctl -u <app> --since ...`. `journald-retention.conf` caps retention
at 500M.

### Alarms

- **Service-level**: `OnFailure=alert-on-failure@%n.service` on every
  service unit. It emails via Resend. It uses the same Resend account as
  product email. No separate webhook service. `alert-on-failure` follows
  the standard shape: `bootstrap.sh` installs the `@.service` template.
  `mise run deploy:alert-on-failure` ships the shell script (to
  `/opt/alert-on-failure/current/`) and the Resend credentials env file.
  Note: on a crash-loop, systemd triggers `OnFailure=` once per restart
  cycle within `StartLimitBurst=` (default 5). A hard-failing service
  produces up to 5 emails before systemd gives up on it. Left as-is: the
  redundancy is cheap and email is not perfectly reliable. Revisit if it
  becomes noisy in practice.
- **Box-level** (deferred): an external dead-man switch (healthchecks.io).
  A down box cannot alert on itself. Add it when the box has been live long
  enough to warrant it.

### Backups (deferred)

Litestream streams the WAL of each SQLite DB to Backblaze B2. Add it when
there is data on the box worth losing sleep over. Sketch:

- `apt-get install litestream` step in `bootstrap.sh`.
- One `<app>-litestream.service` per DB, under the `vps/<app>/` dir of the
  app. Same install pattern.
- B2 credentials go into the `.prod.enc.env` of the relevant app.
- Confirm that each service app opens SQLite with
  `PRAGMA journal_mode=WAL`.

### Rollback

`ssh deploy@$VPS_HOST`, then:

```bash
ln -sfn /opt/<app>/releases/<old-sha> /opt/<app>/current.tmp
mv -Tf /opt/<app>/current.tmp /opt/<app>/current
sudo /bin/systemctl restart <app>.service   # service apps only
```

### Load management

Per-unit systemd caps: `MemoryMax=` (set), `CPUQuota=` (add if needed).
Caddy rate limiting and per-service concurrency caps: add when saturation
actually happens.

---

## Why this shape

- **SQLite and long-running processes** need persistent disk and real
  processes. That rules out serverless.
- **An owned VPS** is the cheapest option and gives full control. No
  multi-region need justifies a PaaS.
- **Caddy** removes the TLS toil without adding an orchestration layer.
- **No Docker on the box** — OCaml binaries are self-contained. Bun
  compiles to a self-contained binary. Static sites are just files. The one
  exception is _build-time_: `apps/sync` is cross-built via a Docker image
  (`vps/sync/Dockerfile.builder`) because Mac-to-Linux OCaml cross-compile
  is not viable today (see ADR 0003). The VPS itself still runs plain ELFs
  under systemd.
- **No manifest, no `kind` enum, no per-kind dispatch code** — four apps
  means four hand-written `deploy.sh` files. Duplication at N=4 is cheaper
  than the abstraction it would take to remove it.
- **One `deploy.sh` per app** because the interesting differences (build
  command, artifact path, restart-or-not, config-or-not) are per-app
  anyway. When two scripts drift, that is information.
- **`EnvironmentFile=` everywhere instead of a config-file arg**: same
  dev/prod code path. Secrets never bake into artifacts. No per-app JSON
  parser at startup. The transient uid never needs to read the config file
  itself.
- **sops + age** because it is git-versioned, has no daemon, and matches
  the systemd and Caddy philosophy.
- **Narrow sudo** because the `deploy` user should not escalate beyond
  restarting known services. Editing that set means re-running bootstrap.
