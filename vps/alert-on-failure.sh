#!/usr/bin/env bash
# Invoked by alert-on-failure@<unit>.service (i.e. any service app's
# OnFailure= line). Reads Resend credentials from EnvironmentFile= in
# the unit, sends one email. No queue, no retry — the external uptime
# check is the backstop if this itself fails.
set -euo pipefail

UNIT="$1"
HOST="$(hostname)"
WHEN="$(date -u +%FT%TZ)"

: "${RESEND_API_KEY:?RESEND_API_KEY not set}"
: "${ALERT_EMAIL_FROM:?ALERT_EMAIL_FROM not set}"
: "${ALERT_EMAIL_TO:?ALERT_EMAIL_TO not set}"

curl -s -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"${ALERT_EMAIL_FROM}\",\"to\":[\"${ALERT_EMAIL_TO}\"],\"subject\":\"[${HOST}] ${UNIT} failed\",\"text\":\"systemd unit ${UNIT} entered a failed state on ${HOST} at ${WHEN}.\"}"
