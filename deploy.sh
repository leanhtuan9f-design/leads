#!/usr/bin/env bash
set -euo pipefail
cd /opt/maps
git pull --ff-only
npm install --no-audit --no-fund --legacy-peer-deps
npm run build
systemctl restart maps-api
REV="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then REV="dirty-$REV"; fi
echo "Deployed: $REV"
