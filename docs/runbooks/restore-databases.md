# Runbook — Restore production databases from Litestream

Restore `auth` and `sync` SQLite DBs from object-storage backups.
Use this after data loss, bad writes, or a broken migration.

This runbook restores one DB at a time to keep blast radius small.

## Prereqs

- `litestream` is installed on the VPS.
- `/etc/litestream.yml` points at the right replica locations.
- `/etc/litestream/litestream.prod.env` has valid R2 credentials.
- SSH access to the box as `ubuntu` with sudo.

DB paths in this repo:

- `sync` → `/var/lib/sync/sync.db`
- `auth` → `/var/lib/auth/auth.db`

---

## 1. Pick the target DB and (optional) point-in-time

Pick one DB first (`sync` or `auth`).

If you need point-in-time restore, pick a UTC RFC3339 timestamp now
(example: `2026-08-05T16:20:00Z`).

## 2. Stop writes

Stop the app that owns the DB and stop litestream.

### Sync DB

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl stop sync.service; sudo systemctl stop litestream.service'
```

### Auth DB

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl stop auth.service; sudo systemctl stop litestream.service'
```

## 3. Preview restore plan (dry run)

### Sync DB

```bash
ssh ubuntu@$VPS_HOST 'sudo litestream restore -config /etc/litestream.yml -dry-run /var/lib/sync/sync.db'
```

### Auth DB

```bash
ssh ubuntu@$VPS_HOST 'sudo litestream restore -config /etc/litestream.yml -dry-run /var/lib/auth/auth.db'
```

For point-in-time restore, add `-timestamp "$RESTORE_AT"`.

## 4. Backup current local files and restore

Take a timestamped local backup copy before overwrite.

### Sync DB

```bash
ssh ubuntu@$VPS_HOST 'bash -s' <<'EOF'
set -euo pipefail
DB=/var/lib/sync/sync.db
TS=$(date -u +%Y%m%dT%H%M%SZ)

sudo test -f "$DB" && sudo cp -a "$DB" "${DB}.bak.${TS}" || true
sudo test -f "${DB}-wal" && sudo cp -a "${DB}-wal" "${DB}-wal.bak.${TS}" || true
sudo test -f "${DB}-shm" && sudo cp -a "${DB}-shm" "${DB}-shm.bak.${TS}" || true

sudo rm -f "$DB" "${DB}-wal" "${DB}-shm"

sudo litestream restore -config /etc/litestream.yml "$DB"
# Point-in-time instead:
# sudo litestream restore -config /etc/litestream.yml -timestamp 2026-08-05T16:20:00Z "$DB"

sudo chown --reference "${DB}.bak.${TS}" "$DB" || true
sudo chmod 640 "$DB" || true
EOF
```

### Auth DB

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
# Point-in-time instead:
# sudo litestream restore -config /etc/litestream.yml -timestamp 2026-08-05T16:20:00Z "$DB"

sudo chown --reference "${DB}.bak.${TS}" "$DB" || true
sudo chmod 640 "$DB" || true
EOF
```

## 5. Start services back up

### Sync DB

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl start sync.service; sudo systemctl start litestream.service'
```

### Auth DB

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl start auth.service; sudo systemctl start litestream.service'
```

## 6. Verify

```bash
ssh ubuntu@$VPS_HOST 'sudo systemctl is-active litestream sync.service auth.service'
ssh ubuntu@$VPS_HOST 'sudo journalctl -u litestream -n 40 --no-pager'
```

Look for `replica sync` logs for both DBs.

Optional app checks:

```bash
curl -I https://auth.maxhill.me
curl -I https://sync.maxhill.me
```

---

## If it goes wrong

- **`no matching backup files available`** — wrong DB path, wrong credentials,
  or replica path is empty. Check `/etc/litestream.yml` and env values.
- **`cannot restore, output path already exists and is not empty`** — remove
  the DB and sidecars first, or use `-force` explicitly.
- **Restored DB starts but app fails** — check app unit logs:
  `journalctl -u sync.service -n 80` or `journalctl -u auth.service -n 80`.
- **Need to roll back this restore** — stop services, move
  `*.bak.<timestamp>` back to original filename, start services again.
