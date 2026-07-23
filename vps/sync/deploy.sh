#!/usr/bin/env bash
# Deploy sync to the VPS. Runs from the laptop, as the deploy user on
# the box. VPS_HOST comes from mise.
set -euo pipefail
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:sync)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/sync/releases/$SHA"

# 1. build
(cd apps/sync && dune build --profile release)

# 2. ship
ssh "deploy@$VPS_HOST" "mkdir -p $REL"
rsync apps/sync/_build/default/bin/main.exe "deploy@$VPS_HOST:$REL/sync-exe"
rsync vps/sync/sync.prod.enc.env            "deploy@$VPS_HOST:/tmp/sync.prod.enc.env"

# 3. release (on box)
ssh "deploy@$VPS_HOST" bash -s <<EOF
  set -euo pipefail
  export SOPS_AGE_KEY_FILE=/etc/sops/key.txt
  chmod +x $REL/sync-exe
  ln -sfn $REL /opt/sync/current.tmp
  mv -Tf /opt/sync/current.tmp /opt/sync/current
  sops -d --input-type dotenv --output-type dotenv \
    /tmp/sync.prod.enc.env > /etc/sync/sync.prod.env
  chmod 600 /etc/sync/sync.prod.env
  rm /tmp/sync.prod.enc.env
  sudo /bin/systemctl restart sync.service
  sleep 1
  systemctl is-active --quiet sync.service || {
    echo "sync.service failed to start" >&2
    journalctl -u sync.service -n 20 --no-pager >&2
    exit 1
  }
EOF

echo "sync deployed at $SHA"
