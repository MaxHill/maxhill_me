#!/usr/bin/env bash
# /vps/bootstrap.sh — idempotent. Run on a fresh Ubuntu box, and
# re-run any time the repo changes (new packages, new caddy site,
# new sudoers line, new app). Always as root.
#
# Assumes /vps/ has already been rsynced to /opt/bootstrap/vps/ (the
# `mise run bootstrap` task does that before invoking this script).
set -euo pipefail
V=/opt/bootstrap/vps

# ---------- packages ----------
apt-get update
apt-get install -y sqlite3 caddy age sops jq ufw

# ---------- deploy user ----------
id deploy &>/dev/null || useradd -m -s /bin/bash deploy

# ---------- firewall ----------
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ---------- VPS age keypair ----------
mkdir -p /etc/sops
[ -f /etc/sops/key.txt ] || age-keygen -o /etc/sops/key.txt
chmod 600 /etc/sops/key.txt

# ---------- system config ----------
install -m 644 "$V/Caddyfile" /etc/caddy/Caddyfile
mkdir -p /etc/systemd/journald.conf.d
install -m 644 "$V/journald-retention.conf" /etc/systemd/journald.conf.d/retention.conf
install -m 440 "$V/sudoers.deploy" /etc/sudoers.d/deploy
visudo -c -f /etc/sudoers.d/deploy   # fail loud if the file is garbage

# ---------- per-app systemd + caddy files ----------
mkdir -p /etc/caddy/sites
install -m 644 "$V/sync/sync.service" /etc/systemd/system/sync.service
install -m 644 "$V/sync/sync.caddy"   /etc/caddy/sites/sync.caddy
install -m 644 "$V/auth/auth.service" /etc/systemd/system/auth.service
install -m 644 "$V/auth/auth.caddy"   /etc/caddy/sites/auth.caddy
install -m 644 "$V/site/site.caddy"   /etc/caddy/sites/site.caddy
install -m 644 "$V/golf/golf.caddy"   /etc/caddy/sites/golf.caddy

# ---------- alert-on-failure (oneshot) ----------
install -m 644 "$V/alert-on-failure@.service" /etc/systemd/system/alert-on-failure@.service
install -m 755 "$V/alert-on-failure.sh"       /usr/local/bin/alert-on-failure.sh
mkdir -p /etc/alert-on-failure
chmod 700 /etc/alert-on-failure
sops -d --input-type json --output-type json \
  "$V/alert-on-failure.prod.enc.json" \
  > /etc/alert-on-failure/alert-on-failure.prod.json
chmod 600 /etc/alert-on-failure/alert-on-failure.prod.json

# ---------- per-app dirs owned by deploy ----------
for app in sync auth site golf; do
  mkdir -p "/opt/$app" "/etc/$app"
  chown deploy:deploy "/opt/$app" "/etc/$app"
  chmod 700 "/etc/$app"
done

# ---------- systemd + caddy ----------
systemctl daemon-reload
systemctl enable --now caddy
systemctl reload caddy
# journald retention only bites after a restart, and only if the config actually changed
systemctl restart systemd-journald

echo
echo "VPS public age key (add to .sops.yaml recipients):"
age-keygen -y /etc/sops/key.txt
