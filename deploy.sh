#!/usr/bin/env bash
set -euo pipefail
cd /opt/maps
git pull --ff-only
npm install --no-audit --no-fund --legacy-peer-deps
npm run build
echo "Deployed: $(git rev-parse --short HEAD)"
