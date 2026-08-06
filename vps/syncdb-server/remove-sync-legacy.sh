#!/usr/bin/env bash
# One-time cleanup of legacy sync service/layout.
# Run BEFORE first syncdb-server deploy/start.
# Keeps data by renaming /var/lib/sync -> /var/lib/syncdb-server and
# sync.db -> syncdb-server.db.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set}"

ssh "ubuntu@$VPS_HOST" bash -s <<'EOF'
set -euo pipefail

echo "[1/6] stop services"
if systemctl list-unit-files | grep -q '^sync\.service'; then
  sudo systemctl stop sync.service || true
  sudo systemctl disable sync.service || true
fi
# Stop new unit too if it was started accidentally.
if systemctl list-unit-files | grep -q '^syncdb-server\.service'; then
  sudo systemctl stop syncdb-server.service || true
fi
sudo systemctl stop litestream.service || true

echo "[2/6] remove legacy unit and symlink"
sudo rm -f /etc/systemd/system/sync.service
sudo rm -f /etc/systemd/system/multi-user.target.wants/sync.service
sudo systemctl daemon-reload

echo "[3/6] migrate DB directory/file"
if [ -d /var/lib/sync ] && [ ! -d /var/lib/syncdb-server ]; then
  sudo mv /var/lib/sync /var/lib/syncdb-server
else
  sudo install -d /var/lib/syncdb-server
fi

if [ -f /var/lib/syncdb-server/sync.db ] && [ ! -f /var/lib/syncdb-server/syncdb-server.db ]; then
  sudo mv /var/lib/syncdb-server/sync.db /var/lib/syncdb-server/syncdb-server.db
fi
if [ -f /var/lib/syncdb-server/sync.db-wal ] && [ ! -f /var/lib/syncdb-server/syncdb-server.db-wal ]; then
  sudo mv /var/lib/syncdb-server/sync.db-wal /var/lib/syncdb-server/syncdb-server.db-wal
fi
if [ -f /var/lib/syncdb-server/sync.db-shm ] && [ ! -f /var/lib/syncdb-server/syncdb-server.db-shm ]; then
  sudo mv /var/lib/syncdb-server/sync.db-shm /var/lib/syncdb-server/syncdb-server.db-shm
fi

echo "[4/6] remove legacy runtime/config paths"
sudo rm -rf /opt/sync
sudo rm -rf /etc/sync

echo "[5/6] verify DB migration result"
if [ -f /var/lib/syncdb-server/syncdb-server.db ]; then
  echo "found migrated DB at /var/lib/syncdb-server/syncdb-server.db"
else
  echo "no legacy DB found to migrate; continuing with fresh DB on first service start"
fi

echo "[6/6] handle litestream (syncdb-server stays stopped until deploy)"
if [ -f /var/lib/syncdb-server/syncdb-server.db ]; then
  sudo systemctl start litestream.service
else
  echo "skipping litestream start until DB is created by syncdb-server"
fi

echo "legacy sync cleanup + DB path migration complete"
EOF

echo "Done. Safe to run deploy for syncdb-server now."
