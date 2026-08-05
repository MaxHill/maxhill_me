#!/usr/bin/env bash
# Deploy litestream to the VPS. Ships:
#   - the shell script to /opt/alert-on-failure/current/ (mirrors how
#     sync-exe and auth-exe live)
#   - the cloudflare r2 credentials env file to /etc/litestream/
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:litestream)}"

rsync --inplace vps/litestream/litestream.yml \
  "deploy@$VPS_HOST:/etc/litestream.yml"
rsync vps/litestream/litestream.prod.enc.env \
  "deploy@$VPS_HOST:/tmp/litestream.prod.enc.env"

ssh "deploy@$VPS_HOST" bash -s <<EOF
  set -euo pipefail
  export SOPS_AGE_KEY_FILE=/etc/sops/key.txt
  sops -d --input-type dotenv --output-type dotenv \
    /tmp/litestream.prod.enc.env \
    > /etc/litestream/litestream.prod.env
  grep -q '^R2_SECRET_KEY=' /etc/litestream/litestream.prod.env || {
    echo "missing R2_SECRET_KEY in litestream.prod.enc.env" >&2
    exit 1
  }
  chmod 600 /etc/litestream/litestream.prod.env
  rm /tmp/litestream.prod.enc.env

  sudo /bin/systemctl enable litestream.service
  sudo /bin/systemctl restart litestream.service
  sudo /bin/systemctl is-active --quiet litestream.service || {
    echo "litestream.service failed to start" >&2
    sudo journalctl -u litestream.service -n 20 --no-pager >&2
    exit 1
  }
EOF

echo "litestream deployed"

