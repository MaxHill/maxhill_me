#!/usr/bin/env bash
# One-time migration: sync.service -> syncdb-server.service
# Run from repo root (or anywhere): bash vps/syncdb-server/migrate.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via `mise run` or export VPS_HOST=...)}"

# Use ubuntu user for privileged migration tasks.
rsync vps/syncdb-server/syncdb-server.service "ubuntu@$VPS_HOST:/tmp/syncdb-server.service"

ssh "ubuntu@$VPS_HOST" bash -s <<'EOF'
set -euo pipefail

# Install new unit.
sudo install -m 644 /tmp/syncdb-server.service /etc/systemd/system/syncdb-server.service
rm -f /tmp/syncdb-server.service

# Stop + disable old unit if present.
if systemctl list-unit-files | grep -q '^sync\.service'; then
  sudo systemctl stop sync.service || true
  sudo systemctl disable sync.service || true
  sudo rm -f /etc/systemd/system/sync.service
  sudo rm -f /etc/systemd/system/multi-user.target.wants/sync.service
fi

# Reload + enable new unit.
sudo systemctl daemon-reload
sudo systemctl enable syncdb-server.service

# If binary already deployed, start/restart new service.
if [ -x /opt/sync/current/sync-exe ]; then
  sudo systemctl restart syncdb-server.service
fi

systemctl is-enabled syncdb-server.service
systemctl is-active syncdb-server.service || true
EOF

echo "migration complete: sync.service -> syncdb-server.service"
