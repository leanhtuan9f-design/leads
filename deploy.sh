#!/usr/bin/env bash
set -euo pipefail
cd /opt/leads
git pull --ff-only
npm install --no-audit --no-fund --legacy-peer-deps
npm run build
install -D -m 0644 ops/maps-trade-refresh.service /etc/systemd/system/maps-trade-refresh.service
install -D -m 0644 ops/maps-trade-refresh.timer /etc/systemd/system/maps-trade-refresh.timer
install -D -m 0644 ops/maps-company-sync.service /etc/systemd/system/maps-company-sync.service
install -D -m 0644 ops/maps-company-sync.timer /etc/systemd/system/maps-company-sync.timer
install -d -m 0755 /etc/maps
if [ ! -f /etc/maps/trade-refresh.env ]; then
  cat > /etc/maps/trade-refresh.env <<'EOF'
TRADE_SOURCE=Cục Thống kê Việt Nam - GSO
TRADE_PRODUCT_PAGE_URL=https://www.nso.gov.vn/du-lieu-va-so-lieu-thong-ke/2026/03/so-lieu-xuat-nhap-khau-cac-thang-nam-2026/
TRADE_TOTAL_PAGE_URL=https://www.nso.gov.vn/du-lieu-va-so-lieu-thong-ke/2026/03/so-lieu-xuat-nhap-khau-cac-thang-nam-2026/
DB_PATH=/var/lib/maps-data/cache.db
EOF
  chmod 0640 /etc/maps/trade-refresh.env
fi
systemctl daemon-reload
systemctl enable --now maps-trade-refresh.timer
systemctl enable --now maps-company-sync.timer
systemctl restart maps-api
REV="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then REV="dirty-$REV"; fi
echo "Deployed: $REV"
