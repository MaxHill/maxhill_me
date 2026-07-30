# Runbook — Remove an app

There is no `decommission.sh`. You will remove an app maybe twice in your
life. Type the commands.

SQLite state at `/var/lib/<app>/` stays in place unless you delete it. Git
regenerates everything else.

---

## 1. On the box (as ubuntu)

```bash
ssh ubuntu@$VPS_HOST
```

```bash
# service apps only
sudo systemctl stop <name>.service
sudo systemctl disable <name>.service
sudo rm -f /etc/systemd/system/<name>.service

# all apps
sudo rm -f /etc/caddy/sites/<name>.caddy
sudo rm -rf /opt/<name>
sudo rm -rf /etc/<name>

sudo systemctl daemon-reload
sudo systemctl reload caddy
```

**SQLite state.** `/var/lib/<name>/` (the systemd `StateDirectory=`) stays
in place. Delete it only if you are sure:

```bash
sudo rm -rf /var/lib/<name>    # irrecoverable
```

## 2. In the repo

- Delete `vps/<name>/`.
- Remove the app `install` lines from `vps/bootstrap.sh`.
- Remove `<name>` from the `for app in sync auth site golf; do` loop in
  `bootstrap.sh`.
- Remove the app line from `vps/sudoers.deploy` (service apps only).
- Remove the app task from `mise.toml`.
- Delete `apps/<name>/` if the product code is also going away.

## 3. DNS

Remove the `<name>.maxhill.me` record.

## 4. Confirm

```bash
mise run bootstrap    # regenerates sudoers cleanly. Nothing should reference <name>.
```

## 5. Sanity check

```bash
ssh ubuntu@$VPS_HOST "sudo ls /etc/systemd/system/ /etc/caddy/sites/ /opt/ /etc/ | grep <name>"
# no output means clean
```
