#!/usr/bin/env bash
# Deploy sync to the VPS. Runs from the laptop, as the deploy user on
# the box. VPS_HOST comes from mise.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:sync)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/sync/releases/$SHA"

# 1. build — cross-compile to Linux/amd64 inside a Docker builder.
# See docs/adr/0003-docker-for-sync-cross-build.md.
IMG=sync-builder:ocaml-5.2
docker image inspect "$IMG" >/dev/null 2>&1 || \
  docker build --platform linux/amd64 -t "$IMG" -f vps/sync/Dockerfile.builder .

# `_build/` is left in the bind-mounted repo on purpose so step 2's
# `rsync` sees the ELF. Only opam state is cached in a named volume.
docker run --rm --platform linux/amd64 \
  -v "$PWD:/src" \
  -v maxhill-sync-opam-cache:/home/opam/.opam \
  -w /src/apps/sync \
  "$IMG" bash -c '
    set -euo pipefail
    # Use the image’s pre-installed OCaml 5.2 switch — no per-project
    # switch needed. Deps only (no --with-test): hegel/ppx_hegel_test
    # are {with-test} and only used by apps/sync/sim, which the
    # release target below does not build.
    opam install . --deps-only -y
    opam exec -- dune build ./bin/main.exe --profile release
  '

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
