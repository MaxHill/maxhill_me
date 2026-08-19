# Runbook — Add an app

Change a small set of files.
Run two commands.
This runbook stays manual on purpose.
At four apps, this cost is small.
If this hurts at eight or more apps, revisit this approach.

Pick a pattern:

- **Service app** — a long-running binary with a port. Templates:
  `syncdb-server`, `auth`.
- **Static app** — a built directory of HTML, JS, and CSS. Templates:
  `site`, `golf`.

---

## 1. Product code

Create `apps/<name>/` with the files the app's own tooling needs
(`package.json`, `dune-project`, and so on). Nothing under `apps/<name>/`
refers to the VPS.

## 2. `vps/<name>/`

Copy the nearest sibling directory.
Rename the files.
Edit the file content.

### Service app

Create five files:

- **`<name>.service`** — the systemd unit.
  Copy `vps/syncdb-server/syncdb-server.service`.
  Replace `syncdb-server` with `<name>`.
  Keep `OnFailure=alert-on-failure@%n.service`.
- **`<name>.caddy`** — the reverse-proxy block. Pick a localhost port that
  nothing else on the box uses.
  ```
  <name>.maxhill.me {
      reverse_proxy localhost:<port>
  }
  ```
- **`<name>.prod.enc.env`** — the sops-encrypted dotenv file. Create it
  with:
  ```bash
  sops edit vps/<name>/<name>.prod.enc.env
  ```
  SOPS opens `$EDITOR` with an empty dotenv skeleton.
  SOPS encrypts the file on save with recipients in `.sops.yaml`.
  Add `KEY=value` lines for each value the app reads.
  Use `process.env` or `Sys.getenv` names.
  Plaintext does not go to disk.
- **`deploy.ts`** — copy `vps/syncdb-server/deploy.ts`.
  Run `s/syncdb-server/<name>/g` where needed.
  Change the build command and artifact path.
- **`deploy-remote.ts`** — copy
  `vps/syncdb-server/deploy-remote.ts`.
  Update release steps.
  Update the symlink swap path.
  Update env decrypt paths.
  Update service restart and checks.

### Static app

Create three files:

- **`<name>.caddy`** — a `file_server` from `/opt/<name>/current`:
  ```
  <name>.maxhill.me {
      root * /opt/<name>/current
      file_server
      encode zstd gzip
  }
  ```
- **`deploy.ts`** — copy `vps/site/deploy.ts`.
  Run `s/site/<name>/g`.
  Change the build command and dist path.
- **`deploy-remote.ts`** — copy `vps/site/deploy-remote.ts`.
  Keep the release symlink swap.
  Adjust paths for `<name>`.

## 3. `vps/bootstrap-remote.ts`

Add install lines next to the existing `syncdb-server` or `auth` block
(service apps) or the `site` or `golf` block (static apps):

```bash
install -m 644 "$V/<name>/<name>.service" /etc/systemd/system/<name>.service   # service only
install -m 644 "$V/<name>/<name>.caddy"   /etc/caddy/sites/<name>.caddy
```

Add `<name>` to the per-app loop that creates `/opt/<app>/` and
`/etc/<app>/`.

## 4. `vps/sudoers.deploy` — service apps only

Add:

```
deploy ALL=(root) NOPASSWD: /bin/systemctl restart <name>.service
```

## 5. `mise.toml`

Add a task:

```toml
[tasks."deploy:<name>"]
description = "Deploy <name>."
run = "pnpm exec tsx vps/<name>/deploy.ts"
```

## 6. DNS

Point `<name>.maxhill.me` (or the hostname in `<name>.caddy`) at the VPS
IP.

## 7. Run it

```bash
mise run bootstrap        # installs the new unit and caddy site, chowns dirs
mise run deploy:<name>    # first release
```

For a service app, the first deploy starts the service.
Bootstrap installs the unit first.
No binary exists before the first deploy.
`systemctl start <name>` fails before the first deploy.

## Verify

```bash
ssh deploy@$VPS_HOST systemctl is-active <name>.service   # service apps
curl -I https://<name>.maxhill.me                         # both
```
