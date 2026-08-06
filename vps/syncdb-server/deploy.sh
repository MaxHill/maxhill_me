#!/usr/bin/env bash
# Deploy syncdb-server to the VPS. Runs from laptop as deploy user.
# VPS_HOST comes from mise.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:sync)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/syncdb-server/releases/$SHA"

# 1. build — cross-compile to Linux/amd64 inside Docker builder.
# See docs/adr/0003-docker-for-sync-cross-build.md.
IMG=sync-builder:ocaml-5.2
docker image inspect "$IMG" >/dev/null 2>&1 || \
  docker build --platform linux/amd64 -t "$IMG" -f vps/syncdb-server/Dockerfile.builder .

# `_build/` is left in the bind-mounted repo on purpose so step 2's
# `rsync` sees the ELF. Only opam state is cached in named volume.
docker run --rm --platform linux/amd64 \
  -v "$PWD:/src" \
  -v maxhill-sync-opam-cache:/home/opam/.opam \
  -w /src/apps/syncdb-server \
  "$IMG" bash -c '
    set -euo pipefail
    # Use image pre-installed OCaml 5.2 switch — no per-project switch.
    # Deps only (no --with-test): hegel/ppx_hegel_test are simulator-only.
    opam install . --deps-only -y
    opam exec -- dune build ./bin/main.exe --profile release
  '

# 2. ship
ssh "deploy@$VPS_HOST" "mkdir -p $REL"
rsync apps/syncdb-server/_build/default/bin/main.exe "deploy@$VPS_HOST:$REL/syncdb-server-exe"
rsync vps/syncdb-server/syncdb-server.prod.enc.env "deploy@$VPS_HOST:/tmp/syncdb-server.prod.enc.env"

# 3. release (on box)
ssh "deploy@$VPS_HOST" bash -s <<EOF
  set -euo pipefail
  export SOPS_AGE_KEY_FILE=/etc/sops/key.txt

  chmod +x $REL/syncdb-server-exe
  ln -sfn $REL /opt/syncdb-server/current.tmp
  mv -Tf /opt/syncdb-server/current.tmp /opt/syncdb-server/current

  sops -d --input-type dotenv --output-type dotenv \
    /tmp/syncdb-server.prod.enc.env > /etc/syncdb-server/syncdb-server.prod.env
  chmod 600 /etc/syncdb-server/syncdb-server.prod.env
  rm /tmp/syncdb-server.prod.enc.env

  sudo /bin/systemctl restart syncdb-server.service
  sleep 1
  systemctl is-active --quiet syncdb-server.service || {
    echo "syncdb-server.service failed to start" >&2
    sudo /bin/systemctl status syncdb-server.service --no-pager -l >&2 || true
    sudo /bin/journalctl -u syncdb-server.service -n 40 --no-pager >&2 || true
    exit 1
  }
EOF

echo "syncdb-server deployed at $SHA"
