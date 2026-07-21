# maxhill.me

Monorepo backing maxhill.me: user-facing web apps and the machinery
that provisions and deploys them to a single Hetzner VPS.

## Language

### Apps

**App**: A deployable unit with source at `/apps/<name>/`. Today:
`site` (Astro), `golf` (PWA), `sync` (OCaml), `auth` (Bun-compiled).
_Avoid_: service (ambiguous — see below), project, package.

**Service app**: An app whose deploy artifact is an executable binary,
run as a systemd unit and reverse-proxied by Caddy. Today: `sync`,
`auth`. _Avoid_: service (unqualified — drifts).

**Static app**: An app whose deploy artifact is a built directory of
HTML/JS/CSS, served by Caddy's `file_server`. Today: `site`, `golf`.

**On-box helper**: A systemd unit + shell script installed by
`bootstrap.sh`, invoked on demand (usually via `OnFailure=`). No
`/apps/<name>/` source, no per-release shipping. Today:
`alert-on-failure`. Lives entirely under `/vps/`.

### VPS

**/vps/**: Top-level directory holding everything about how apps get
onto the box: `bootstrap.sh`, box-wide config files (Caddyfile,
journald retention, sudoers), the `alert-on-failure` helper, and one
directory per app containing its systemd unit / Caddy site / encrypted
config / `deploy.sh`. _Avoid_: cicd/, ops/, infra/, deploy/.

**Bootstrap**: The action of turning a fresh Ubuntu box into a
provisioned one, or bringing an existing box in line with the repo
(new packages, updated caddy site, added app). Runs as root via
`mise run bootstrap` (rsyncs `/vps/` up, sshes in, runs
`bootstrap.sh`). Idempotent. Purely additive — bootstrap never
removes anything.

**Deploy**: The action of shipping one app to the VPS. Each app has
its own `vps/<app>/deploy.sh`, invoked via `mise run deploy:<app>`.
Runs as the `deploy` user on the box. Three steps: build locally,
rsync the artifact + (for service apps) encrypted config, then on the
box do the atomic `current` symlink swap and (for service apps)
decrypt config + restart the unit.

**Narrow sudo**: The `deploy` user's only sudo grants:
`systemctl restart <app>.service` per registered service app, plus
`systemctl reload caddy`. No wrapper, no `ALL`, no wildcards. Lives
in `vps/sudoers.deploy` (hand-written), installed by `bootstrap.sh`.
