#!/usr/bin/env bash
# Invoked by alert-on-failure@<unit>.service (i.e. any service app's
# OnFailure= line). Reads Resend credentials from the config file it's
# handed, sends one email. No queue, no retry — the external uptime
# check is the backstop if this itself fails.
set -euo pipefail

CONFIG="$1"
UNIT="$2"
HOST="$(hostname)"
WHEN="$(date -u +%FT%TZ)"

RESEND_API_KEY=$(jq -r .RESEND_API_KEY "$CONFIG")
ALERT_EMAIL_FROM=$(jq -r .ALERT_EMAIL_FROM "$CONFIG")
ALERT_EMAIL_TO=$(jq -r .ALERT_EMAIL_TO "$CONFIG")

curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"${ALERT_EMAIL_FROM}\",\"to\":[\"${ALERT_EMAIL_TO}\"],\"subject\":\"[${HOST}] ${UNIT} failed\",\"text\":\"systemd unit ${UNIT} entered a failed state on ${HOST} at ${WHEN}.\"}"
