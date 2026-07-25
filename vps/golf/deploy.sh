#!/usr/bin/env bash
# Deploy golf (PWA static) to the VPS.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:golf)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/golf/releases/$SHA"

# Build-time env for vite (VITE_AUTH_URL, VITE_SYNC_URL). Public
# URLs only — no secrets — so the file is committed plaintext.
set -a
# shellcheck source=./golf.build.env
. "$(dirname "$0")/golf.build.env"
set +a

(cd apps/golf && pnpm exec vite build)

ssh "deploy@$VPS_HOST" "mkdir -p $REL"
rsync -a --delete apps/golf/dist/ "deploy@$VPS_HOST:$REL/"
ssh "deploy@$VPS_HOST" "ln -sfn $REL /opt/golf/current.tmp && mv -Tf /opt/golf/current.tmp /opt/golf/current"

echo "golf deployed at $SHA"
