# Design QA — selected landing concept 1

final result: passed

- source visual truth path: `docs/design/concepts/landing-01-orange-trade.png`
- implementation screenshot path: `.playwright-cli/maps-orange/1484-final.png`
- viewport: 1484 × 1060 CSS px, deviceScaleFactor 1
- source pixels: 1484 × 1060; implementation pixels: 1484 × 1060. No density scaling needed.
- state: homepage `/`, coffee/Germany sample, monthly pricing; no login or scraping initiated by the landing.
- full-view comparison evidence: `.playwright-cli/maps-orange/comparison-final.png` (reference left, implementation right, 2968 × 1060)
- focused region evidence: `.playwright-cli/maps-orange/comparison-hero-detail.png` (headline, copy, CTA and icons; same 650 × 415 crop from each)
- mobile evidence: `.playwright-cli/maps-orange/375-final.png`, `320-final.png`; tablet: `768-final.png`, `1024-final.png`.
- driver: Playwright CLI; user explicitly authorized its use in this task.

## Findings and comparison history

1. Initial capture `desktop-first.png`: P2 hero rectangle was visible against page background and content sat lower than target. Removed multiply blending, adjusted hero type to 76px/1.14 and padding, preserved search at target y≈536. Generated a transparent edge revision using Image Gen; final consumes `trade-hero-orange-cutout.png`, keeping the ship, globe, container, coffee and fruit composition. Post-fix `desktop-cutout.png`, then `1484-final.png` show seamless background integration.
2. Initial mobile `mobile-first.png`: P1 preview grid expanded to table minimum width, clipping surrounding content. Added `min-width: 0` to the preview content and minmax(0,1fr) tablet track; horizontal scrolling is confined to table and an explanatory mobile hint appears. Post-fix `mobile-second.png` and `375-final.png` show contained controls and text.
3. Initial axe check: P1 small orange text and button foreground contrast insufficient. Darkened actionable orange to #c73510, pricing kicker to #a8300e; retained #f04a20 for large display headline/icons. Final axe runs returned zero violations at all tested widths.

No actionable P0/P1/P2 findings remain.

## Required fidelity surfaces

- Fonts/typography: self-hosted Be Vietnam Pro 400–800, heavy two-line 76px headline at reference width, matching dark/orange hierarchy. Plus Jakarta Sans retained for brand. Exact unknown source font is approximated by the existing Vietnamese-safe font; remaining optical differences are P3.
- Spacing/layout: reference left alignment, broad cream hero, international commerce artwork on right, floating horizontal search, intro beside three-row result surface, orange icon benefit row preserved. Sample selector/filter/CSV controls extend the lower preview slightly; this is an intentional functional addition rather than a decorative layout change. Below-source pricing/FAQ/footer retain established application flows with matching warm tokens.
- Colors/tokens: cream #f8f5ef, dark #102026, display orange #f04a20, accessible action orange #c73510. Buttons are intentionally darker than the raster reference to meet contrast. Same restrained borders and soft elevation; no generated gradient substitutes.
- Image quality: custom high-resolution trade artwork made with built-in Image Gen from selected reference; genuine alpha revision removes outer rectangle. Subject, warm lighting and composition match. Standard outline icons are from Tabler, selected after comparing alternatives; no handcrafted illustration/SVG replacement. The reference's compass logo is represented by the established compass brand symbol, keeping Lead Finder identity.
- Copy/content: headline faithfully preserved. Mock's invented Trade Atlas branding replaced by existing Lead Finder. Fictional websites/emails and the ambiguous 'results from reality' label replaced by clearly labelled illustrative data; product capabilities stay grounded in source.

## Behavior and accessibility

- `npx tsc --noEmit`, Vite preview build, `git diff --check`: pass.
- 1484/1024/768/375/320: no page overflow, table within viewport, font loads, axe zero violations.
- Mobile menu/navigation/close; product required validation; sample switch; email-only filter; detail open/close; CSV download; monthly/annual pricing and Advanced/Annual billing URL; FAQ; skip-link first keyboard focus; 200% zoom; simulated catalog error/retry: pass.
- Browser JavaScript page errors: zero. Expected mocked HTTP 503 excluded from production verdict.
- No scrape run, checkout or payment submitted in QA.
- Screen-reader and Safari/Firefox coverage not performed; automated checks do not establish full WCAG certification.

## Follow-up polish

P3 only: a font-specific optical pass could tighten the last differences from generated source typography; sample controls intentionally add height. No extra approval gate required after the selected concept.
