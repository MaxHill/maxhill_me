#!/usr/bin/env bash
# /vps/bootstrap.sh — idempotent. Run on a fresh Ubuntu box, and
# re-run any time the repo changes (new packages, new caddy site,
# new sudoers line, new app). Always as root.
#
# Assumes /vps/ has already been rsynced to /opt/bootstrap/vps/ (the
# `mise run bootstrap` task does that before invoking this script).
set -euo pipefail
V=/opt/bootstrap/vps
export SOPS_AGE_KEY_FILE=/etc/sops/key.txt

# ---------- packages ----------
apt-get update
apt-get install -y sqlite3 caddy age jq ufw curl ca-certificates

# sops isn't in Ubuntu's apt repos — pin a version, install from GitHub.
SOPS_VERSION=3.9.4
if ! command -v sops >/dev/null || [ "$(sops --version | awk '{print $2; exit}')" != "$SOPS_VERSION" ]; then
  ARCH=$(dpkg --print-architecture)
  curl -fsSL "https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.${ARCH}" \
    -o /usr/local/bin/sops
  chmod +x /usr/local/bin/sops
fi

# ---------- deploy user + sops-readers group ----------
id deploy &>/dev/null || useradd -m -s /bin/bash deploy
getent group sops-readers >/dev/null || groupadd -r sops-readers
usermod -aG sops-readers deploy

# ---------- firewall ----------
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ---------- VPS age keypair ----------
mkdir -p /etc/sops
[ -f /etc/sops/key.txt ] || age-keygen -o /etc/sops/key.txt
# Root owns the key; sops-readers (deploy) can read it for deploy-time
# sops-decrypt. /etc/sops itself stays 755 so group members can traverse.
chown root:sops-readers /etc/sops/key.txt
chmod 640 /etc/sops/key.txt
chmod 755 /etc/sops

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
install -m 644 "$V/auth/auth.service"       /etc/systemd/system/auth.service
install -m 644 "$V/auth/auth-sweep.service" /etc/systemd/system/auth-sweep.service
install -m 644 "$V/auth/auth-sweep.timer"   /etc/systemd/system/auth-sweep.timer
install -m 644 "$V/auth/auth.caddy"         /etc/caddy/sites/auth.caddy
install -m 644 "$V/site/site.caddy"   /etc/caddy/sites/site.caddy
install -m 644 "$V/golf/golf.caddy"   /etc/caddy/sites/golf.caddy

# ---------- alert-on-failure (oneshot) ----------
install -m 644 "$V/alert-on-failure@.service" /etc/systemd/system/alert-on-failure@.service
install -m 755 "$V/alert-on-failure.sh"       /usr/local/bin/alert-on-failure.sh
mkdir -p /etc/alert-on-failure
chmod 700 /etc/alert-on-failure
sops -d --input-type dotenv --output-type dotenv \
  "$V/alert-on-failure.prod.enc.env" \
  > /etc/alert-on-failure/alert-on-failure.prod.env
chmod 600 /etc/alert-on-failure/alert-on-failure.prod.env

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
# auth's hourly kv-sweep timer (once-only enable; idempotent to re-run)
systemctl enable --now auth-sweep.timer
# journald retention only bites after a restart, and only if the config actually changed
systemctl restart systemd-journald

echo
echo "VPS public age key (add to .sops.yaml recipients):"
age-keygen -y /etc/sops/key.txt
