# Landing redesign verification — 2026-10-27

Source skill: [common-ui-design](https://github.com/HoangNguyen0403/agent-skills-standard/tree/develop/skills/common/common-ui-design), revision `92d06c4`. Direction documented in `landing-direction.md`.

driver: playwright-cli 0.1.22, isolated Chromium (existing local executable)
evidence_dir: .playwright-cli/maps-redesign/

## Before / After

- Before: `desktop-before.png`, `mobile-before.png`, matching `.aria.txt` captures from production.
- After: `1440-after.png`, `768-after.png`, `375-after.png`; `production-desktop.png`, `production-mobile.png`, `production-mobile.aria.txt`.
- Difference: pale green globe illustration replaced by cobalt/navy trade composition and local port photograph. Product demo now changes sector/country, filters illustrative records, selects a detail view, and downloads a clearly labelled mock CSV. Product search has its own form. Pricing supports monthly/annual catalogs and forwards plan/cycle into the existing modal.
- Neighbor check: app remains `/app`, inputs preserve product/country; tools retain self-hosted original fonts; Lead module/auth/scraper/backend not changed. No scrape job or checkout submitted during verification.

## Results

- `npx tsc --noEmit`: PASS.
- Vite build to preview directory, then `npm run build` to nginx-served dist: PASS.
- `git diff --check`: PASS.
- Viewports 1440, 768, 375: no horizontal overflow; local font loaded; axe zero violations at each.
- Menu open/navigation/close, demo selection/detail, email filter (2 mock rows), sample CSV download: PASS.
- Annual prices and generated billing URL: PASS.
- Required product validation, first keyboard focus on skip link, 200% zoom without horizontal overflow: PASS.
- Simulated catalog 503 -> visible error -> retry restores prices: PASS. Expected mocked network error excluded from production verdict.
- Production search `Hạt điều / United States` transfers correct inputs to `/app`: PASS.
- Production Advanced/Annual selection in existing billing modal: PASS, no checkout created.
- Production pageerror count: zero; production axe: zero violations. Observed CLS approximately 0.00044 in one Chromium run, not a field performance metric.
- All newly added fonts/images served from same origin. Existing Cloudflare beacon remains upstream-managed.

Limits: no NVDA/VoiceOver run, no Firefox/Safari verification. Automated axe and keyboard checks do not establish full WCAG certification.

## Deployment

Frontend built directly to `/opt/maps/dist` served by existing nginx. No backend restart or infrastructure edits; no GitHub push authorization. `deploy.sh` not run because it pulls remote and restarts scraper for a frontend-only task; existing project memory documents this deployment path.
