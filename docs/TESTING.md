# Testing

Use Node.js 22.12 or newer and npm. Dependencies and Playwright are pinned by `package-lock.json`; do not invoke a separate latest Playwright version.

## Install and prepare

```sh
npm ci
npx playwright install chromium
npm run ingest
```

`playwright install chromium` reuses an installed matching browser. On squiggle, the current Playwright release uses Chromium revision 1248, already available in `/home/iris/.cache/ms-playwright`. If a fresh Linux machine lacks browser system libraries, an administrator can run `npx playwright install-deps chromium` once. This is a terminal-driven workflow; no desktop or browser extension is required.

## Unit checks and production build

```sh
npm test
npm run typecheck
npm run build
```

Normalisation/status tests use source-shaped fixtures. AI validation tests exercise malicious/invented citations, evidence separation, missing values, privacy checks and processing behavior. Browser tests use imported real Camden records. None of these test commands silently spend OpenAI API credits.

## Headless browser checks

```sh
npm run test:e2e
```

The configuration starts its own Next.js server on `127.0.0.1:3147`, waits for readiness, runs desktop and mobile Chromium with one worker, and stops its server afterward. The server uses an isolated `.data/e2e-3147` PGlite directory, seeded from the checked-in real Camden snapshot, rather than the development database. Do not run ingestion concurrently against that same directory. The owned test server clears `DATABASE_URL`, `OPENAI_API_KEY` and `ADMIN_TOKEN` so it cannot write a hosted database or spend API credits. An explicitly supplied `E2E_BASE_URL` uses that server’s own configuration. It refuses to reuse an existing process accidentally.

To use a different isolated port and artifact directory:

```sh
E2E_PORT=3157 E2E_ARTIFACT_DIR=/tmp/nimbywatch-qa npm run test:e2e
```

To run against a server you explicitly started:

```sh
npm run dev -- --port 3147
E2E_BASE_URL=http://127.0.0.1:3147 npm run test:e2e
```

Stop that server with Ctrl-C only in its own terminal. Do not kill shared Node or Chromium processes by name.

Desktop viewport: 1440 × 1000. Mobile viewport: Playwright Pixel 7. Each browser test gets an isolated context. Screenshots and retained failure traces are written under `test-results/` (or `E2E_ARTIFACT_DIR`), which is ignored by Git. Inspect the PNG files using an image viewer before making visual claims. Failure traces can be opened with the pinned runner:

```sh
npx playwright show-trace test-results/<failed-test-directory>/trace.zip
```

## Scope and external services

The browser suite verifies rendered data, search/filter behavior, application navigation, analytics coverage, responsive layout and the administrator access boundary. It checks JavaScript/console errors and failed requests, including external map requests. Expected navigation/tile cancellations (`net::ERR_ABORTED`) are recorded but do not fail the suite. Each test writes `browser-health.json` alongside screenshots. Live basemap requests depend on provider availability and configuration; a configuration/error state must be explicit. Tests do not treat a missing key or failed third-party service as successful live integration.

The editorial form also has a clearly labelled synthetic response-interception test covering `.txt` upload, draft display, citation rendering, three publication checks and the submitted review body. It does not call a model or publish to the database. Live OpenAI validation is a separate, explicitly enabled operation documented in `docs/ANALYSIS.md`. Keep its results private until reviewed and record the model, source, validation outcome and estimated cost. A successful mock test is not evidence of live model quality.

## Verify the production server

After the development suite passes, verify the built application on a separate port. In one terminal:

```sh
npm run build
DATABASE_URL= OPENAI_API_KEY= ADMIN_TOKEN= PGLITE_DATA_DIR=.data/e2e-production npm run start -- --port 3151
```

In another terminal:

```sh
E2E_BASE_URL=http://127.0.0.1:3151 E2E_ARTIFACT_DIR=artifacts/verification/production npm run test:e2e
```

This explicitly started production server is not owned by Playwright; stop it with Ctrl-C in its own terminal after verification. The production suite keeps final screenshots and browser-health logs in the ignored `artifacts/verification/production` directory. No development indicator appears in these screenshots. Browser tests require permission to bind/use localhost and fetch public map assets in sandboxed environments; if the sandbox blocks server startup, rerun the same task-scoped command with the approved network/listener permissions rather than changing frameworks.

## Housing evidence checks

The housing browser cases use the checked-in, source-backed description-extraction snapshot. They make no OpenAI requests. The specific regression is Camden `2026/4237/P`: the description explicitly states one self-contained dwelling, so its proposed-home measure must show **1**, **AI-extracted**, the supporting passage and original source link. Net additional, affordable and approved homes must remain **Unknown**. The same evidence must feed the filtered dashboard total and development-size filters.

Run just these desktop/mobile cases with the existing isolated server recipe:

```sh
E2E_PORT=3157 E2E_ARTIFACT_DIR=artifacts/verification/housing npm run test:e2e -- tests/e2e/housing.spec.ts
```

For an already running isolated staging or private production server, substitute its base URL:

```sh
E2E_BASE_URL=http://127.0.0.1:3151 E2E_ARTIFACT_DIR=artifacts/verification/housing-production npm run test:e2e -- tests/e2e/housing.spec.ts
```

These cases are read-only and do not start or stop a server when `E2E_BASE_URL` is supplied. Each saves a housing-evidence screenshot, a filtered-dashboard screenshot and browser-health logs. The normal full suite includes them. A snapshot-backed browser test verifies persistence, presentation and filtering; extraction semantics are additionally tested in unit tests, and any new live extraction run must report its source, model and cost separately.
