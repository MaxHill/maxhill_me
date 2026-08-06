#!/usr/bin/env bash
# One-time destructive cleanup of legacy sync service/layout.
# Run BEFORE first syncdb-server deploy/start.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set}"

ssh "ubuntu@$VPS_HOST" bash -s <<'EOF'
set -euo pipefail

echo "[1/4] stop+disable legacy sync.service if present"
if systemctl list-unit-files | grep -q '^sync\.service'; then
  sudo systemctl stop sync.service || true
  sudo systemctl disable sync.service || true
fi

# Also stop new unit if it was started accidentally before cleanup.
sudo systemctl stop syncdb-server.service || true


echo "[2/4] remove legacy unit and symlink"
sudo rm -f /etc/systemd/system/sync.service
sudo rm -f /etc/systemd/system/multi-user.target.wants/sync.service
sudo systemctl daemon-reload

echo "[3/4] remove legacy runtime/config/data paths"
sudo rm -rf /opt/sync
sudo rm -rf /etc/sync
sudo rm -rf /var/lib/sync

echo "[4/4] verify legacy paths gone"
for p in /opt/sync /etc/sync /var/lib/sync; do
  if [ -e "$p" ]; then
    echo "legacy path still exists: $p" >&2
    exit 1
  fi
done

echo "legacy sync cleanup complete"
EOF

echo "Done. Safe to run deploy for syncdb-server now."
