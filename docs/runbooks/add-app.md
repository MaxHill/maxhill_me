# Runbook — Add an app

Touch five files. Run two commands. This is manual on purpose. At four
apps, the boilerplate is trivial. If it hurts at eight or more apps,
reconsider whether the new app belongs on the box.

Pick a pattern:

- **Service app** — a long-running binary with a port. Templates: `sync`,
  `auth`.
- **Static app** — a built directory of HTML, JS, and CSS. Templates:
  `site`, `golf`.

---

## 1. Product code

Create `apps/<name>/` with the files the app's own tooling needs
(`package.json`, `dune-project`, and so on). Nothing under `apps/<name>/`
refers to the VPS.

## 2. `vps/<name>/`

Copy the nearest sibling directory. Rename the files. Edit the contents.

### Service app

Create four files:

- **`<name>.service`** — the systemd unit. Copy `vps/sync/sync.service` and
  replace `sync` with `<name>`. Keep
  `OnFailure=alert-on-failure@%n.service`.
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
  sops opens `$EDITOR` with an empty dotenv skeleton. sops encrypts the
  file on save against the recipients in `.sops.yaml`. Add `KEY=value`
  lines for each value the app reads from `process.env` or `Sys.getenv`.
  Plaintext never lands on disk.
- **`deploy.sh`** — copy `vps/sync/deploy.sh`. Run `s/sync/<name>/g`. Swap
  the build command and the artifact path.

### Static app

Create two files:

- **`<name>.caddy`** — a `file_server` from `/opt/<name>/current`:
  ```
  <name>.maxhill.me {
      root * /opt/<name>/current
      file_server
      encode zstd gzip
  }
  ```
- **`deploy.sh`** — copy `vps/site/deploy.sh`. Run `s/site/<name>/g`. Swap
  the build command and the dist path.

## 3. `vps/bootstrap.sh`

Add install lines next to the existing `sync` or `auth` block (service
apps) or the `site` or `golf` block (static apps):

```bash
install -m 644 "$V/<name>/<name>.service" /etc/systemd/system/<name>.service   # service only
install -m 644 "$V/<name>/<name>.caddy"   /etc/caddy/sites/<name>.caddy
```

Add `<name>` to the per-app `for app in sync auth site golf; do` loop that
creates `/opt/<app>/` and `/etc/<app>/`.

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

Point `<name>.maxhill.me` (or the hostname in `<name>.caddy`) at the VPS
IP.

## 7. Run it

```bash
mise run bootstrap        # installs the new unit and caddy site, chowns dirs
mise run deploy:<name>    # first release
```

For a service app, the first deploy starts the service. Bootstrap installs
the unit, but no binary exists yet. `systemctl start <name>` alone fails.

## Verify

```bash
ssh deploy@$VPS_HOST systemctl is-active <name>.service   # service apps
curl -I https://<name>.maxhill.me                         # both
```
