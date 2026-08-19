# Runbook — Remove an app

There is no `decommission.sh` script.
Remove the app with these steps.

By default, SQLite data stays at `/var/lib/<name>/`.
Remove that data only when you intend permanent deletion.

## 1. Remove app files on the box

Connect:

```bash
ssh ubuntu@$VPS_HOST
```

Run these commands:

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

## 2. Remove SQLite data only if needed

`/var/lib/<name>/` stays in place.
Delete it only if you are sure.

```bash
sudo rm -rf /var/lib/<name>
```

## 3. Remove app references in the repo

1. Delete `vps/<name>/`.
2. Remove app `install` lines from `vps/bootstrap-remote.ts`.
3. Remove `<name>` from the app loop in `vps/bootstrap-remote.ts`.
4. Remove app lines from `vps/sudoers.deploy` for service apps.
5. Remove the app task from `mise.toml`.
6. Delete `apps/<name>/` if product code is retired.

## 4. Remove DNS

Remove the `<name>.maxhill.me` DNS record.

## 5. Confirm

```bash
mise run bootstrap
```

Make sure no config still references `<name>`.

## 6. Final check on the box

```bash
ssh ubuntu@$VPS_HOST "sudo ls /etc/systemd/system/ /etc/caddy/sites/ /opt/ /etc/ | grep <name>"
```

The command must print no output.
