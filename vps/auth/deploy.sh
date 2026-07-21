#!/usr/bin/env bash
# Deploy auth to the VPS. Assumes apps/auth has been migrated off
# Cloudflare Workers to a Bun-compiled binary — see docs/vps.md.
set -euo pipefail
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:auth)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/auth/releases/$SHA"

# 1. build (bun --compile, cross-compiled for linux-x64)
(cd apps/auth && bun build --compile --target=bun-linux-x64 ./src/index.ts --outfile=./dist/auth-exe)

# 2. ship
ssh "deploy@$VPS_HOST" "mkdir -p $REL"
rsync apps/auth/dist/auth-exe     "deploy@$VPS_HOST:$REL/auth-exe"
rsync vps/auth/auth.prod.enc.json "deploy@$VPS_HOST:/tmp/auth.prod.enc.json"

# 3. release (on box)
ssh "deploy@$VPS_HOST" bash -s <<EOF
  set -euo pipefail
  export SOPS_AGE_KEY_FILE=/etc/sops/key.txt
  chmod +x $REL/auth-exe
  ln -sfn $REL /opt/auth/current.tmp
  mv -Tf /opt/auth/current.tmp /opt/auth/current
  sops -d --input-type json --output-type json \
    /tmp/auth.prod.enc.json > /etc/auth/auth.prod.json
  chmod 600 /etc/auth/auth.prod.json
  rm /tmp/auth.prod.enc.json
  sudo /bin/systemctl restart auth.service
  sleep 1
  systemctl is-active --quiet auth.service || {
    echo "auth.service failed to start" >&2
    journalctl -u auth.service -n 20 --no-pager >&2
    exit 1
  }
EOF

echo "auth deployed at $SHA"
