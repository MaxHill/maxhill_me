#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:auth)}"
SSH_OPTS='-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3'
RSYNC_SSH="ssh $SSH_OPTS"

SHA=$(git rev-parse --short HEAD)
REL="/opt/auth/releases/$SHA"

# 1. build (bun --compile, cross-compiled for linux-x64)
echo "building"
(cd apps/auth && bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile=./dist/auth-exe)

# 2. ship
echo "deploying"
ssh $SSH_OPTS "deploy@$VPS_HOST" "mkdir -p $REL"
rsync -avP --stats --timeout=30 -e "$RSYNC_SSH" apps/auth/dist/auth-exe    "deploy@$VPS_HOST:$REL/auth-exe"
rsync -avP --stats --timeout=30 -e "$RSYNC_SSH" vps/auth/auth.prod.enc.env "deploy@$VPS_HOST:/tmp/auth.prod.enc.env"

# 3. release (on box)
echo "releasing"
ssh $SSH_OPTS "deploy@$VPS_HOST" bash -s <<EOF
  set -euo pipefail
  export SOPS_AGE_KEY_FILE=/etc/sops/key.txt
  chmod +x $REL/auth-exe
  ln -sfn $REL /opt/auth/current.tmp
  mv -Tf /opt/auth/current.tmp /opt/auth/current
  sops -d --input-type dotenv --output-type dotenv \
    /tmp/auth.prod.enc.env > /etc/auth/auth.prod.env
  chmod 600 /etc/auth/auth.prod.env
  rm /tmp/auth.prod.enc.env
  sudo /bin/systemctl restart auth.service
  sleep 1
  systemctl is-active --quiet auth.service || {
    echo "auth.service failed to start" >&2
    journalctl -u auth.service -n 20 --no-pager >&2
    exit 1
  }
EOF

echo "auth deployed at $SHA"
