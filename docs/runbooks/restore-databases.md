# Runbook — Restore production databases from Litestream

Use this runbook to restore production SQLite databases from Litestream.
Use it after data loss, bad writes, or a bad migration.

Restore one database at a time.
This limits risk.

## Prerequisites

- `litestream` is installed on the VPS.
- `/etc/litestream.yml` points to correct replica paths.
- `/etc/litestream/litestream.prod.env` has valid R2 credentials.
- You have SSH access as `ubuntu` with sudo.

Database paths:

- `syncdb-server` → `/var/lib/syncdb-server/syncdb-server.db`
- `auth` → `/var/lib/auth/auth.db`

## 1. Pick one target database

Pick one database first.
Use `syncdb-server` or `auth`.

If you need point-in-time restore, choose a UTC RFC3339 time.
Example: `2026-08-05T16:20:00Z`.

## 2. Stop writes

Stop the app service.
Stop `litestream.service`.

### Sync database

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl stop syncdb-server.service; sudo systemctl stop litestream.service'
```

### Auth database

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl stop auth.service; sudo systemctl stop litestream.service'
```

## 3. Preview the restore plan

Run a dry run before restore.

### Sync database

```bash
ssh ubuntu@$VPS_HOST 'sudo litestream restore -config /etc/litestream.yml -dry-run /var/lib/syncdb-server/syncdb-server.db'
```

### Auth database

```bash
ssh ubuntu@$VPS_HOST 'sudo litestream restore -config /etc/litestream.yml -dry-run /var/lib/auth/auth.db'
```

For point-in-time restore, add `-timestamp "$RESTORE_AT"`.

## 4. Back up current files and restore

Make a timestamped local backup copy before overwrite.

### Sync database

```bash
ssh ubuntu@$VPS_HOST 'bash -s' <<'EOF'
set -euo pipefail
DB=/var/lib/syncdb-server/syncdb-server.db
TS=$(date -u +%Y%m%dT%H%M%SZ)

sudo test -f "$DB" && sudo cp -a "$DB" "${DB}.bak.${TS}" || true
sudo test -f "${DB}-wal" && sudo cp -a "${DB}-wal" "${DB}-wal.bak.${TS}" || true
sudo test -f "${DB}-shm" && sudo cp -a "${DB}-shm" "${DB}-shm.bak.${TS}" || true

sudo rm -f "$DB" "${DB}-wal" "${DB}-shm"

sudo litestream restore -config /etc/litestream.yml "$DB"
# Point-in-time example:
# sudo litestream restore -config /etc/litestream.yml -timestamp 2026-08-05T16:20:00Z "$DB"

sudo chown --reference "${DB}.bak.${TS}" "$DB" || true
sudo chmod 640 "$DB" || true
EOF
```

### Auth database

```bash
ssh ubuntu@$VPS_HOST 'bash -s' <<'EOF'
set -euo pipefail
DB=/var/lib/auth/auth.db
TS=$(date -u +%Y%m%dT%H%M%SZ)

sudo test -f "$DB" && sudo cp -a "$DB" "${DB}.bak.${TS}" || true
sudo test -f "${DB}-wal" && sudo cp -a "${DB}-wal" "${DB}-wal.bak.${TS}" || true
sudo test -f "${DB}-shm" && sudo cp -a "${DB}-shm" "${DB}-shm.bak.${TS}" || true

sudo rm -f "$DB" "${DB}-wal" "${DB}-shm"

sudo litestream restore -config /etc/litestream.yml "$DB"
# Point-in-time example:
# sudo litestream restore -config /etc/litestream.yml -timestamp 2026-08-05T16:20:00Z "$DB"

sudo chown --reference "${DB}.bak.${TS}" "$DB" || true
sudo chmod 640 "$DB" || true
EOF
```

## 5. Start services

Start the app service.
Start `litestream.service`.

### Sync database

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl start syncdb-server.service; sudo systemctl start litestream.service'
```

### Auth database

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl start auth.service; sudo systemctl start litestream.service'
```

## 6. Verify

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl is-active litestream syncdb-server.service auth.service'
ssh ubuntu@$VPS_HOST 'sudo journalctl -u litestream -n 40 --no-pager'
```

Look for `replica sync` logs for both databases.

Optional checks:

```bash
curl -I https://auth.maxhill.me
curl -I https://sync.maxhill.me
```

## If it goes wrong

- **`no matching backup files available`**
  Check database path.
  Check credentials.
  Check replica path in `/etc/litestream.yml`.
- **`cannot restore, output path already exists and is not empty`**
  Remove database files and sidecars first.
  Or use `-force` if you intend overwrite.
- **Database restores but app fails**
  Check unit logs:
  `journalctl -u syncdb-server.service -n 80`
  `journalctl -u auth.service -n 80`
- **You must roll back this restore**
  Stop services.
  Move `*.bak.<timestamp>` files to original names.
  Start services again.
