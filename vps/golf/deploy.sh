#!/usr/bin/env bash
# Deploy golf (PWA static) to the VPS.
set -euo pipefail
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:golf)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/golf/releases/$SHA"

(cd apps/golf && pnpm build)

ssh "deploy@$VPS_HOST" "mkdir -p $REL"
rsync -a --delete apps/golf/dist/ "deploy@$VPS_HOST:$REL/"
ssh "deploy@$VPS_HOST" "ln -sfn $REL /opt/golf/current.tmp && mv -Tf /opt/golf/current.tmp /opt/golf/current"

echo "golf deployed at $SHA"
