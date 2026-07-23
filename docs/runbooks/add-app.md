# Runbook — Add an app

Five files to touch, two commands to run. Deliberately manual: at
N=4 apps, boilerplate is trivial. If it starts to hurt at N=8+,
reconsider whether the new app really deserves the box.

Pick your pattern:

- **Service app** — long-running binary, has a port. Templates: `sync`, `auth`.
- **Static app** — built directory of HTML/JS/CSS. Templates: `site`, `golf`.

---

## 1. Product code

Create `apps/<name>/` with whatever the app's own tooling wants
(`package.json`, `dune-project`, etc.). Nothing under `apps/<name>/`
knows about the VPS.

## 2. `vps/<name>/`

Copy the nearest sibling. Rename files, edit contents.

### Service app

Four files:

- **`<name>.service`** — systemd unit. Copy `vps/sync/sync.service`,
  replace `sync` with `<name>`. Keep `OnFailure=alert-on-failure@%n.service`.
- **`<name>.caddy`** — reverse-proxy block. Pick a localhost port
  nothing else on the box uses.
  ```
  <name>.maxhill.me {
      reverse_proxy localhost:<port>
  }
  ```
- **`<name>.prod.enc.env`** — sops-encrypted dotenv config. Create it
  directly with:
  ```bash
  sops edit vps/<name>/<name>.prod.enc.env
  ```
  sops opens `$EDITOR` with an empty dotenv skeleton and encrypts on
  save against the recipients in `.sops.yaml`. Fill in `KEY=value`
  lines for whatever the app reads from `process.env` / `Sys.getenv`.
  Plaintext never lands on disk.
- **`deploy.sh`** — copy `vps/sync/deploy.sh`, `s/sync/<name>/g`, swap
  the build command and artifact path.

### Static app

Two files:

- **`<name>.caddy`** — `file_server` from `/opt/<name>/current`:
  ```
  <name>.maxhill.me {
      root * /opt/<name>/current
      file_server
      encode zstd gzip
  }
  ```
- **`deploy.sh`** — copy `vps/site/deploy.sh`, `s/site/<name>/g`, swap
  the build command and dist path.

## 3. `vps/bootstrap.sh`

Add install line(s) near the existing `sync`/`auth` (service) or
`site`/`golf` (static) block:

```bash
install -m 644 "$V/<name>/<name>.service" /etc/systemd/system/<name>.service   # service only
install -m 644 "$V/<name>/<name>.caddy"   /etc/caddy/sites/<name>.caddy
```

Add `<name>` to the per-app `for app in sync auth site golf; do` loop
that creates `/opt/<app>/` and `/etc/<app>/`.

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
run = "bash vps/<name>/deploy.sh"
```

## 6. DNS

Point `<name>.maxhill.me` (or whichever hostname is in `<name>.caddy`)
at the VPS's IP.

## 7. Run it

```bash
mise run bootstrap        # installs the new unit / caddy site, chowns dirs
mise run deploy:<name>    # first release
```

For a service app the first deploy is what starts it — bootstrap
installs the unit but there's no binary yet, so `systemctl start
<name>` alone would fail.

## Verify

```bash
ssh deploy@$VPS_HOST systemctl is-active <name>.service   # service apps
curl -I https://<name>.maxhill.me                         # both
```
