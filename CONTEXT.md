# maxhill.me

This monorepo contains maxhill.me apps.
It also contains the tools that provision and deploy one Hetzner VPS.

## Language

### Apps

**App**: A deployable unit with source at `/apps/<name>/`. Today:
`site` (Astro), `golf` (PWA), `syncdb-server` (OCaml, serves `sync`),
`auth` (Bun-compiled). _Avoid_: service (ambiguous — see below),
project, package.

**Service app**: An app whose deploy artifact is an executable binary,
run as a systemd unit and reverse-proxied by Caddy. Today:
`syncdb-server` and `auth`. _Avoid_: service (unqualified — drifts).

**Static app**: An app whose deploy artifact is a built directory of
HTML/JS/CSS, served by Caddy's `file_server`. Today: `site`, `golf`.

**On-box helper**: A systemd unit and a compiled binary.
Deploy scripts install it.
Systemd runs it on demand, usually from `OnFailure=`.
It has no `/apps/<name>/` source.
Today this helper is `alert-on-failure`.
Its source is in `/vps/alert-on-failure/`.

### VPS

**/vps/**: Top-level directory for VPS operations.
It contains `bootstrap.ts` and `bootstrap-remote.ts`.
It contains box-wide config files, such as Caddyfile and sudoers.
It contains the `alert-on-failure` helper.
It contains one directory per app with unit files, Caddy config,
encrypted config, `deploy.ts`, and `deploy-remote.ts`.
_Avoid_: cicd/, ops/, infra/, deploy/.

**Bootstrap**: Prepare a fresh Ubuntu box for this repo.
You can also use it to align an existing box with repo changes.
Run `mise run bootstrap`.
This command rsyncs `/vps/`, compiles and ships `bootstrap-remote.ts`,
and runs it as root.
Bootstrap is idempotent.
Bootstrap only adds or updates files. It does not remove files.

**Deploy**: Ship one app to the VPS.
Each app has `vps/<app>/deploy.ts`.
Run it with `mise run deploy:<app>`.
The deploy script compiles and ships `deploy-remote.ts` with app files.
Then it runs the remote binary as user `deploy` on the box.
Deploy has three steps.
Build local files.
Rsync the artifact, encrypted config for service apps, and remote runner.
Swap the `current` symlink atomically on the box.
For service apps, decrypt config and restart the unit.

**Narrow sudo**: The `deploy` user's only sudo grants:
`systemctl restart <app>.service` per registered service app, plus
`systemctl reload caddy`. No wrapper, no `ALL`, no wildcards. Lives
in `vps/sudoers.deploy` (hand-written), installed by bootstrap.
