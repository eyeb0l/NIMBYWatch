# NIMBYWatch

A public-interest explorer of real Camden planning applications. Search the live-source dataset, inspect outcomes on a map, follow the original planning record, and review source-backed document analysis without confusing resident objections with officers' assessments or formal decisions.

## Run locally

Requires Node.js 22.12+ and npm. From a clean checkout:

```sh
npm ci
npm run ingest
npm run dev
```

Open http://127.0.0.1:3000. Ingestion retrieves the verified Camden Socrata source and upserts 180 residential-related applications by default. For offline startup, restore the checked-in real-data snapshot:

```sh
npm run ingest -- --snapshot
```

The app also seeds that snapshot when a new database is empty. It does not generate synthetic planning records. The imported cohort is a bounded, keyword-selected sample of residential-related applications, including alterations and variations; it is not a census of new housing proposals. Always read its coverage and source timestamps.

Local persistence uses PGlite, a PostgreSQL engine stored in `.data/postgres`. Stop the development server before running ingestion against the same PGlite directory; it is single-process storage. Set `PGLITE_DATA_DIR` to use an isolated directory. Set `DATABASE_URL` to use PostgreSQL instead, including a Supabase PostgreSQL connection string. Migrations are applied automatically; `npm run db:migrate` applies them explicitly.

The map uses Mapbox GL JS when `NEXT_PUBLIC_MAPBOX_TOKEN` is configured. A clean checkout uses MapLibre GL with the documented tokenless CARTO vector basemap, retaining CARTO/OpenStreetMap attribution. Both paths provide geographic interaction and clustered real application markers. Source coordinates are approximate postcode centroids, not development boundaries.

## Configuration

Copy `.env.example` to `.env.local` if configuration is needed, preserving any existing secrets. Next.js and all three CLI commands (ingestion, migrations and analysis) load `.env.local` automatically using Next.js environment loading. Values already supplied in the process environment take precedence, so isolated test directories or deployment credentials are preserved. Node can also load an environment file explicitly without printing its contents:

```sh
node --env-file=.env.local --import tsx scripts/ingest.ts
```

Do not commit `.env.local`. `DATABASE_URL`, `OPENAI_API_KEY`, `ADMIN_TOKEN` and Socrata credentials remain server-side. The Mapbox token is intentionally public and should have URL restrictions.

OpenAI key provisioning is optional for browsing. Use the secure OpenAI key setup flow to populate the server's `OPENAI_API_KEY`. Document processing is disabled without a key and a strong `ADMIN_TOKEN`. The analysis workflow also enforces per-document and daily spend reservations. See [document analysis](docs/ANALYSIS.md) for manual inputs, review and budget behavior.

## Housing evidence

Housing figures now distinguish Source-reported, AI-extracted and Unknown. The checked-in real extraction snapshot supplies explicit proposed-home counts for 43 of the 176 applications (a partial sum of 133), with source quotations and model provenance. Other measures require their own evidence. See [housing workflow](docs/HOUSING.md) for the bounded, idempotent `npm run housing:extract` command and safe refresh procedure.

## Evidence and coverage

- Housing values distinguish **Source-reported**, **AI-extracted** and **Unknown**, independently for proposed, net additional, approved and affordable homes. Structured council fields remain untouched. Explicit numbers extracted from descriptions carry checked quotations; authorised-document numbers contribute after publication review. Partial dashboard sums disclose coverage and do not count unique homes. A refused application is never automatically labelled lost housing.
- Source facts retain the original reference, source URL, source status, decision, source update timestamp and ingestion timestamp.
- AI-derived claims require exact source passages. Resident objections, officer assessments, recommendations, refusal reasons and approval conditions are separate evidence types.
- New analysis is private. Publication requires an administrator to review accuracy, remove personal information and confirm reuse rights. Raw uploaded documents are not public.
- Counts and charts disclose their denominators and analysis coverage. Zero reviewed analyses means no analytical evidence, not no objections.

Read [source verification and reuse conditions](docs/SOURCES.md) before extending ingestion. Camden planning-portal documents are copyright restricted; automated discovery or copying is not enabled. The GLA Datahub was investigated but does not silently enrich the Camden cohort.

## Architecture

```text
scripts/ingest.ts             Fetch and idempotently normalise Camden records
src/lib/data/                Source adapter and application repository
src/lib/db.ts                PostgreSQL / local PGlite connection
migrations/                  Versioned schema
src/lib/analysis/            Grounding, structured extraction, budgets and review
src/app/api/analysis/         Authenticated administrator endpoints
src/app/                     Next.js pages
src/components/              Responsive map and editorial interface
```

Next.js, TypeScript, Tailwind CSS and shadcn/ui power the interface. PostgreSQL-compatible persistence is separate from ingestion and analysis so future borough adapters can share the application schema without rewriting presentation.

## Checks

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The pinned Playwright runner exercises desktop/mobile Chromium headlessly, using an isolated port and database. See [testing instructions](docs/TESTING.md) for exact commands, screenshot/trace paths and service limitations. Browser tests never trigger paid analysis. Live model validation must be deliberately enabled and reported separately.

## Private hosting on squiggle

The running instance is available at [NIMBYWatch over Tailscale](https://squiggle.spaniel-delta.ts.net:4300). See [hosting operations](docs/HOSTING.md) for service controls, safe data refreshes and private-URL verification.

## Deploy to Vercel

1. Create a PostgreSQL database, for example a Supabase project, and configure `DATABASE_URL` using its documented SSL-enabled connection URI. The server requires schema-migration permissions on first startup; migrations can instead be applied ahead of deployment.
2. Set `NEXT_PUBLIC_MAPBOX_TOKEN` for the Mapbox path. Optional AI processing additionally needs server-only `OPENAI_API_KEY`, a strong `ADMIN_TOKEN`, and suitable `AI_MAX_DOCUMENT_USD` / `AI_DAILY_BUDGET_USD` limits.
3. Import this repository into Vercel using its Next.js preset. Run `npm run ingest` against the production database from a trusted environment. The application also includes the real seed snapshot for first startup.
4. Verify map rendering, original-source links, coverage and the administrator authentication boundary on the deployed URL.

PGlite is explicitly disabled on Vercel: ephemeral filesystem storage is not a production database. No production project is provisioned or deployed by merely running this repository. Restrict database access to the server, keep administrative tokens private, and rotate any compromised credential.

## MVP limitations

The first cohort covers Camden only. Residential-related keyword selection is transparent but not exhaustive. Structured source unit counts are unavailable; supported description extractions are labelled separately. Do not interpret missing counts as zero. No planning-portal drawings or residents' submissions are bundled. Document uploads initially support authorised text / `.txt`, with page boundaries retained when supplied; PDF extraction and automatic document discovery are future work. Manual review remains necessary to judge interpretation, privacy and reuse rights.
