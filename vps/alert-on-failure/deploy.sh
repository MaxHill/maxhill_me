#!/usr/bin/env bash
# Deploy alert-on-failure to the VPS. Ships:
#   - the shell script to /opt/alert-on-failure/current/ (mirrors how
#     sync-exe and auth-exe live)
#   - the Resend credentials env file to /etc/alert-on-failure/
#
# The systemd @.service template is installed by bootstrap.sh (same
# as sync.service, auth.service, etc). No service to restart —
# alert-on-failure@<unit>.service is instantiated on-demand by
# OnFailure= when some other unit fails.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:alert-on-failure)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/alert-on-failure/releases/$SHA"

ssh "deploy@$VPS_HOST" "mkdir -p $REL"
rsync vps/alert-on-failure/alert-on-failure.sh \
  "deploy@$VPS_HOST:$REL/alert-on-failure.sh"
rsync vps/alert-on-failure/alert-on-failure.prod.enc.env \
  "deploy@$VPS_HOST:/tmp/alert-on-failure.prod.enc.env"

ssh "deploy@$VPS_HOST" bash -s <<EOF
  set -euo pipefail
  export SOPS_AGE_KEY_FILE=/etc/sops/key.txt
  chmod +x $REL/alert-on-failure.sh
  ln -sfn $REL /opt/alert-on-failure/current.tmp
  mv -Tf /opt/alert-on-failure/current.tmp /opt/alert-on-failure/current
  sops -d --input-type dotenv --output-type dotenv \
    /tmp/alert-on-failure.prod.enc.env \
    > /etc/alert-on-failure/alert-on-failure.prod.env
  chmod 600 /etc/alert-on-failure/alert-on-failure.prod.env
  rm /tmp/alert-on-failure.prod.enc.env
EOF

echo "alert-on-failure deployed at $SHA"
