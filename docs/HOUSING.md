# Housing evidence

The application keeps four structured-source fields untouched: `proposedUnits`, `netAdditionalUnits`, `approvedUnits` and `affordableUnits`. A derived `housing` view resolves each independently to **Source-reported**, **AI-extracted** or **Unknown**. An explicit structured value takes precedence; otherwise matching high-confidence extractions may supply the value. Conflicting quantities stay unknown and retain their evidence for inspection.

The description workflow extracts narrow numerical claims from already-public council text. Each accepted number has an exact quotation, source URL, text hash, model, prompt version, confidence and processing time. These results are labelled AI-extracted and not editorially reviewed. General document analysis remains private until an operator reviews accuracy, privacy and rights; only its published housing findings can contribute.

Unknown values are never zero. Explicit zero is supported. Net additional homes require an explicit net measure, never subtraction. Affordable homes need a separate affordable count. Description inputs cannot establish approved homes, regardless of the application's status. Existing homes undergoing alterations, bedrooms, historic permissions, approximate ranges, and ambiguous amended proposals are excluded rather than interpreted as new housing quantities.

## Extract descriptions

Use the existing ignored `.env.local` OpenAI configuration. No API requests happen on page loads or ordinary ingestion. Preview the maximum cost before an explicit run:

```sh
npm run housing:extract -- --limit=176
npm run housing:extract -- --run --limit=176 --concurrency=3 --export=data/camden-housing.json
```

The default limit is 20. Use `--id=camden-2026-4237-P` for one application. Concurrency defaults to one and is capped at three. The workflow shares the transactional daily budget with document analysis, reserves a conservative maximum cost, disables automatic API retries and reuses unchanged attempts. Failed/interrupted attempts stay recorded; investigate before deliberately retrying. Changing a prompt version is not a substitute for investigating failures.

**PGlite permits one process per database directory.** Stop `nimbywatch.service` before running a CLI against its local database, or prepare results in an isolated database:

```sh
PGLITE_DATA_DIR=.data/housing-staging npm run housing:extract -- --run --limit=176 --concurrency=3 --export=data/camden-housing.json
```

Fresh isolated databases seed the real application snapshot. The exported housing file contains actual model results and provenance, never synthetic planning data. A repository read imports only completed snapshot records matching the current description hash and supported model/prompt, rechecks their quotations, and does not overwrite existing records. A source description or source link change invalidates the old extraction immediately. Inspect the extracted quantities against source text before distributing a refreshed snapshot.

## Aggregation

Dashboard totals and development-size filters use the same resolved values. Each total reports the number of structured, extracted and unknown records. Totals are partial sums across application records, not counts of unique homes, approved delivery or housing lost. Revised/duplicate applications can describe the same homes. Housing extraction does not increase objection-analysis coverage.

Tests cover quotation grounding, explicit measure attribution, independent unknown fields, structured-source precedence, conflicting/stale evidence, storage/idempotency/budget behavior and desktop/mobile housing flows. The example `2026/4237/P` must resolve to one proposed dwelling from its explicit description, leaving net additional, approved and affordable homes unknown.
