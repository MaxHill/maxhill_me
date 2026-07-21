# Runbook — Remove an app

No `decommission.sh`. You'll remove an app maybe twice in your life —
type the commands.

SQLite state at `/var/lib/<app>/` is preserved unless you explicitly
delete it. Everything else is regeneratable from git.

---

## 1. On the box (as root)

```bash
ssh root@$VPS_HOST
```

```bash
# service apps only
systemctl stop <name>.service
systemctl disable <name>.service
rm -f /etc/systemd/system/<name>.service

# all apps
rm -f /etc/caddy/sites/<name>.caddy
rm -rf /opt/<name>
rm -rf /etc/<name>

systemctl daemon-reload
systemctl reload caddy
```

**SQLite state.** `/var/lib/<name>/` (systemd's `StateDirectory=`)
is left in place. Delete it only if you're sure:

```bash
rm -rf /var/lib/<name>    # irrecoverable
```

## 2. In the repo

- Delete `vps/<name>/`.
- Remove the app's `install` lines from `vps/bootstrap.sh`.
- Remove `<name>` from the `for app in sync auth site golf; do` loop in
  `bootstrap.sh`.
- Remove the app's line from `vps/sudoers.deploy` (service apps only).
- Remove the app's task from `mise.toml`.
- Optionally delete `apps/<name>/` if the product code is also going
  away.

## 3. DNS

Remove the `<name>.maxhill.me` record.

## 4. Confirm

```bash
mise run bootstrap    # regenerates sudoers cleanly; nothing should reference <name>
```

## 5. Sanity check

```bash
ssh root@$VPS_HOST "ls /etc/systemd/system/ /etc/caddy/sites/ /opt/ /etc/ | grep <name>"
# → no output means clean
```
