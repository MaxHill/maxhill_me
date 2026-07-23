#!/usr/bin/env bash
# Deploy site (Astro static) to the VPS.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${VPS_HOST:?VPS_HOST not set (run via mise run deploy:site)}"

SHA=$(git rev-parse --short HEAD)
REL="/opt/site/releases/$SHA"

(cd apps/site && pnpm build)

ssh "deploy@$VPS_HOST" "mkdir -p $REL"
rsync -a --delete apps/site/dist/ "deploy@$VPS_HOST:$REL/"
ssh "deploy@$VPS_HOST" "ln -sfn $REL /opt/site/current.tmp && mv -Tf /opt/site/current.tmp /opt/site/current"

echo "site deployed at $SHA"
