# /vps/ layout and privilege model

We centralise all VPS deployment machinery under a single `/vps/`
directory rather than colocating it per-app under `/apps/<name>/vps/`,
and we use narrow per-service `systemctl` sudo grants instead of a
generic on-box wrapper script. We also **do not abstract over app
kinds** — each app has its own hand-written `deploy.sh`.

> **Revised 2026-07-21.** An earlier draft of this ADR designed an
> `app.json` manifest, a `kind ∈ {service, static, oneshot}` enum, an
> extension-convention placement engine in `bootstrap.sh`, a shared
> `/usr/local/bin/release` script, and a `decommission.sh`. At N=4
> apps that abstraction cost more than the duplication it removed. It
> was replaced by one hand-written `deploy.sh` per app + a hardcoded
> `bootstrap.sh`. Original design preserved in git history.

## Layout

```
/vps/
  bootstrap.sh                     idempotent, root, runs on every re-provision
  Caddyfile                        → /etc/caddy/Caddyfile
  journald-retention.conf          → /etc/systemd/journald.conf.d/
  sudoers.deploy                   → /etc/sudoers.d/deploy  (hand-written)
  alert-on-failure@.service        → /etc/systemd/system/
  alert-on-failure.sh              → /usr/local/bin/
  alert-on-failure.prod.enc.json   decrypted on box to /etc/alert-on-failure/
  <app>/                           one dir per app; contents vary by app
    <app>.service                  (service apps)
    <app>.caddy                    (all apps)
    <app>.prod.enc.json            (apps with secrets)
    deploy.sh                      always present, hand-written
```

`/apps/` stays purely product source. Nothing under `/apps/<name>/`
knows about the VPS.

`bootstrap.sh` names each app it installs by hand. There is no
discovery loop, no manifest, no dispatch.

## Considered options

- **Manifest + generic deploy engine** (`app.json`, `kind`, per-kind
  dispatch, shared `release`, `decommission.sh`). Rejected as
  premature at N=4. The abstraction would have exchanged 4 × ~25-line
  deploy scripts for a manifest schema, a placement DSL, a dispatch
  loop, and a runtime union type — code that only starts paying for
  itself somewhere around N=10 apps or N=5 kinds. See earlier draft
  in git history.

- **Per-app colocation** (`/apps/<name>/vps/…`). Rejected: at 4 apps
  on 1 host, the single-vantage-point benefit of `/vps/` beats the
  cognitive-locality benefit of colocation.

- **Generic on-box wrapper** (`/usr/local/bin/deploy-service`) invoked
  via one broad sudo rule. Rejected in favour of narrow per-service
  `systemctl restart <app>.service` grants. The wrapper concentrates
  root-capable code that must stay in sync with deploy scripts.
  Narrow sudo keeps the on-box privilege surface the smallest set of
  commands `deploy` actually needs; unit-file / caddy-site / sudoers
  changes go through `bootstrap.sh` (which is already designed to be
  idempotent and re-runnable).

- **Drop the `deploy` user, SSH as root.** Rejected: cheap defence in
  depth is worth having on a single-key setup.

- **Docker / Docker Compose / a self-hosted PaaS (Dokku, Coolify,
  Kamal).** Rejected: OCaml native binaries, Bun-compiled binaries,
  and static file trees are all already self-contained. A container
  layer would add build/runtime cost without solving a real problem
  at this scale.

## Consequences

- Adding an app is a five-file touch (create `vps/<app>/`, edit
  `bootstrap.sh`, edit `sudoers.deploy`, edit `mise.toml`, add DNS)
  followed by `mise run bootstrap` and the first
  `mise run deploy:<app>`. See the runbook in `docs/vps.md`.
- Removing an app is a hand-typed cleanup on the box + reversing the
  five-file touch. There is no `decommission.sh`.
- Deploy scripts will drift as apps' needs diverge. That's the trade:
  divergence stays legible instead of accumulating conditionals in a
  shared engine.
- The `deploy` user has no way to escalate to root beyond restarting
  named services and reloading Caddy. A compromised deploy key can
  flap services but not gain shell.
- SQLite state under `/var/lib/<app>/` is preserved on removal unless
  explicitly deleted.
- If N grows meaningfully (~8+ apps, or a fourth genuinely different
  execution model), revisit the manifest abstraction. Until then,
  duplication is cheaper than the abstraction.
