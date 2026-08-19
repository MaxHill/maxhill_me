# VPS

How apps get onto the box.

Local orchestration scripts use TypeScript (`*.ts`).
They run with `pnpm exec tsx ...` through `mise` tasks.
On-box bootstrap and release steps run as compiled Bun Linux binaries
from `*-remote.ts` files.

- **One VPS** (Hetzner CX22). Ubuntu. Caddy for TLS. systemd for process
  management. No Docker runtime on the box.
- **Four apps** — `syncdb-server` and `auth` are long-running services
  (OCaml and Bun-compiled binaries). `site` and `golf` are static
  (Astro and a PWA).
- **One helper**, `alert-on-failure`.
  It is a systemd `@.service` template.
  It sends email through Resend when a service fails.
  Bootstrap installs the unit template.
  `vps/alert-on-failure/deploy.ts` ships the binary and env file.
- **Three users on the box**: `ubuntu` (SSH access), `root` (bootstrap), and
  `deploy` (runs every deploy, with narrow sudo grants to restart the two
  services and reload Caddy — nothing else).

---

## Repo layout

```
/vps/
  bootstrap.ts                     local orchestrator (compile + ship + run)
  bootstrap-remote.ts              compiled Linux binary, runs as root on VPS
  utils.ts                         shared deploy/bootstrap helpers
  Caddyfile                        → /etc/caddy/Caddyfile
  journald-retention.conf          → /etc/systemd/journald.conf.d/retention.conf
  sudoers.deploy                   → /etc/sudoers.d/deploy  (hand-written)
  alert-on-failure/
    alert-on-failure@.service      → /etc/systemd/system/
    alert-on-failure.ts            compiled to on-box binary
    alert-on-failure.prod.enc.env  decrypted on box to /etc/alert-on-failure/
    deploy.ts                      local deploy orchestrator
    deploy-remote.ts               compiled Linux binary, runs on VPS
  syncdb-server/
    syncdb-server.service          → /etc/systemd/system/
    sync.caddy                     → /etc/caddy/sites/
    syncdb-server.prod.enc.env     decrypted to /etc/syncdb-server/syncdb-server.prod.env
    (syncdb-server.dev.env — gitignored, plaintext)
    deploy.ts                      local deploy orchestrator
    deploy-remote.ts               compiled Linux binary, runs on VPS
  auth/                            same shape as syncdb-server
  site/
    site.caddy                     → /etc/caddy/sites/
    deploy.ts
    deploy-remote.ts
  golf/
    golf.caddy                     → /etc/caddy/sites/
    golf.build.env                 build-time VITE_* vars (public URLs, plaintext)
    deploy.ts
    deploy-remote.ts
```

`bootstrap.ts` rsyncs `vps/`.
It compiles and ships `bootstrap-remote.ts`.
It runs the remote binary on the box as root.
Do not use stow.
Do not use symlinks for config files.
Deploy uses one symlink swap at `/opt/<app>/current`.

---

## Build paths per app

- **`syncdb-server`** (OCaml, serves `sync.maxhill.me`) — cross-built
  inside a Docker container pinned to
  `ocaml/opam:ubuntu-24.04-ocaml-5.2`, targeting linux/amd64.
  `vps/syncdb-server/deploy.ts` builds the image on first run. It caches opam state
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

There is no `deploy:all` task.
You usually do not need it.
If needed, chain commands:
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

Dev and prod use the same code path.
Only the env source changes.
For dev, `mise` auto-loads `vps/<app>/<app>.dev.env` from `[env]._.file`.
Run `mise run run` in `apps/<app>/`.
Or run `mise --cd apps/<app> run run` from the repo root.

**Static apps with build-time env** (`golf`): Vite inlines `VITE_*` vars
into the built bundle. Prod values live in `vps/<app>/<app>.build.env` —
plaintext, committed, no secrets. Build-time env for static apps is public
URLs by construction. The deploy script sources the file before
`vite build`.

---

## Secrets (sops + age)

Two age keypairs. Both are listed as recipients in `.sops.yaml`:

- **Laptop keypair** — lets you edit every `.prod.enc.env`.
- **VPS keypair** — generated by bootstrap at `/etc/sops/key.txt`. It
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
`/home/ubuntu/.ssh/authorized_keys` before first boot. Bootstrap clones
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

- **Service-level**: Add `OnFailure=alert-on-failure@%n.service` to each
  service unit.
  The helper sends email through Resend.
  It uses the same Resend account as product email.
  Do not add a separate webhook service.
  Bootstrap installs the `@.service` template.
  `mise run deploy:alert-on-failure` ships a compiled binary to
  `/opt/alert-on-failure/current/alert-on-failure`.
  It also ships the Resend credential env file.
  In a crash loop, systemd can trigger up to `StartLimitBurst=` emails.
  Default `StartLimitBurst=` is 5.
  Keep this behavior unless it becomes noisy.
- **Box-level** (deferred): Use an external dead-man switch,
  for example healthchecks.io.
  A down box cannot alert on itself.
  Add this check after the box runs long enough to justify it.

### Backups

Litestream is live. It replicates both production SQLite databases
(`/var/lib/syncdb-server/syncdb-server.db` and `/var/lib/auth/auth.db`) to Cloudflare R2.

- Bootstrap installs Litestream and the systemd drop-in.
- `mise run deploy:litestream` ships `/etc/litestream.yml` and encrypted R2
  credentials (`/etc/litestream/litestream.prod.env`).
- `litestream.service` runs continuously and logs periodic `replica sync`
  lines for both DBs.
- Recovery procedure lives in `docs/runbooks/restore-databases.md`.

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
- **No Docker on the box**.
  OCaml binaries are self-contained.
  Bun compiles to a self-contained binary.
  Static sites are plain files.
  One build-time exception exists.
  `apps/syncdb-server` cross-builds in a Docker image from
  `vps/syncdb-server/Dockerfile.builder`.
  This avoids Mac-to-Linux OCaml cross-compile limits.
  See ADR 0003.
  The VPS still runs plain ELF binaries under systemd.
- **No manifest, no `kind` enum, no per-kind dispatch code** — each app has
  a hand-written deploy pair (`deploy.ts` + `deploy-remote.ts`).
  Duplication at this repo size is cheaper than the abstraction it would
  take to remove it.
- **One deploy entrypoint per app** because the interesting differences
  (build command, artifact path, restart-or-not, config-or-not) are per-app
  anyway. When two scripts drift, that is information.
- **`EnvironmentFile=` everywhere instead of a config-file arg**: same
  dev/prod code path. Secrets never bake into artifacts. No per-app JSON
  parser at startup. The transient uid never needs to read the config file
  itself.
- **sops + age** because it is git-versioned, has no daemon, and matches
  the systemd and Caddy philosophy.
- **Narrow sudo** because the `deploy` user should not escalate beyond
  restarting known services. Editing that set means re-running bootstrap.
