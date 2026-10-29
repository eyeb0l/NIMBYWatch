# MVP verification — 29 October 2026

## Housing evidence update

The housing feature now distinguishes Source-reported, AI-extracted and Unknown. The 176 real descriptions were processed with bounded live OpenAI calls. The exported snapshot contains 169 completed records; seven could not pass validation and remain unknown. Forty-three records have explicit supported proposed-home quantities, summing to 133 across application records. Net additional, approved and affordable quantities all remain unknown. The target 2026/4237/P has one proposed dwelling with its exact quotation. Raw council unit fields remain null.

An initial wording-validator limitation rejected 18 attempts; those attempts were archived before a deliberate single retry, preserving all daily budget reservations. Total estimated API cost including failed attempts and retry was $0.064226; reserved maximum $0.707852. There were no automatic retries. Sanitized run evidence is in `artifacts/housing/verification.json`; the actual source-backed snapshot is `data/camden-housing.json`.

Unit/type checks pass. Twelve desktop/mobile staging browser checks passed, covering provenance labels, exact source evidence, independent unknown measures, partial totals and size filters. The detail screenshots were opened and inspected. The production build then passed and the live Tailscale service was updated after backing up the existing database and build. All 12 desktop/mobile checks passed again against the live HTTPS URL in 34.2 seconds, with no console errors or unexpected network failures. Final screenshots and health logs are in `artifacts/verification/housing-live/`. The initial implementation results below describe the state before this update.

## Real data and persistence

The live Camden Socrata importer retrieved and persisted 176 residential-related applications. Re-importing the checked-in snapshot changed zero records. Outcomes in this snapshot: 65 approved, 8 refused, 14 withdrawn and 89 pending. No structured housing quantities are supplied by the source; all four unit measures remain unknown. See SOURCES.md for selection bias, licence and location precision.

Tests cover normalization/status mapping, explicit unknown and zero quantities, idempotent update behavior, empty-database seeding, reconnect persistence, quote/page validation, evidence separation, privacy checks, authentication, bounded request bodies, concurrent processing deduplication and spending reservations. `npm test`, `npm run typecheck` and `npm run build` pass.

## Browser verification

Eight Playwright cases passed against both the development server and the optimized production build, in desktop and mobile Chromium. The production run used an isolated database, port 3151, one worker and no API credentials. It exercised search, filters, real map rendering, list/map selection, zoom/reset, details, provenance, analytics denominators, privacy boundaries and the analysis form/review controls. The analysis interaction test uses explicitly synthetic intercepted responses; it does not prove live model quality.

Final screenshots were opened and visually inspected. The map and controls render, the mobile layout remains within the viewport, and production pages have no development indicator. Browser-health logs contain no console/page errors or non-aborted failed requests. Normal cancelled navigation/prefetch/tile requests are retained in logs.

Local, ignored artifacts:

- `artifacts/verification/production/`: desktop/mobile screenshots and per-test `browser-health.json`.
- `artifacts/verification/dev/`: development verification screenshots.

Reproduce using docs/TESTING.md. The task-owned servers were stopped afterward.

## Live AI verification

The configured OpenAI account was used to process one real, OGL-licensed Camden application description (2026/3743/P). A grounded structured summary matched the exact supplied quotation. The full pipeline saved a private draft; an unchanged repeat reused it. Estimated total cost, including the initial diagnostic call, was $0.001208. Sanitized evidence is in ignored `artifacts/ai-live-validation.json`; the draft is in the isolated local `.data/ai-verification` database and is not published.

This validates the live API and grounded-summary path. It does not validate officer-report or objection interpretation: authorised examples and human evaluation are still needed. The public app correctly reports zero published objection-analysis coverage.

## Configuration still needed for hosted deployment

- A production PostgreSQL connection (`DATABASE_URL`), for example Supabase. PGlite was tested locally; a hosted PostgreSQL service was not provisioned or exercised.
- A restricted public Mapbox token to exercise the Mapbox GL JS path. The token-free MapLibre/CARTO vector path was verified live.
- Hosted server-only AI credentials and operator token if enabling analysis, with appropriate budget limits.

The repository includes migrations, environment examples and Vercel-compatible build configuration, but no public deployment has been created. GLA enrichment and automatic planning-document discovery remain disabled until reuse conditions permit them.
