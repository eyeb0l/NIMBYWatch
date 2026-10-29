# NIMBYWatch contributor guidance

NIMBYWatch is a public-interest planning evidence explorer. Keep source facts, AI interpretations, resident objections, officer assessments and formal decision reasons distinct. Never infer causation between objections and refusal. Missing housing counts stay `null`; proposed, net additional, approved and affordable units are separate measures.

## Data and privacy

- Read `docs/SOURCES.md` before changing ingestion. Preserve the source URL, source update time, ingestion time and residential selection method.
- Do not scrape protected planning documents or republish drawings. Use the authorised manual analysis workflow.
- Never publish objectors' personal information. General document-analysis drafts must remain private until an administrator reviews accuracy, privacy and rights. The housing-evidence feature requested by the user permits a narrow exception: validated, high-confidence numerical extraction from already-public council descriptions may be shown as AI-extracted, with the exact passage and a visible not-editorially-reviewed indicator. Never present these as structured council facts. Authorised-document housing findings still require publication review.
- Keep credentials server-side. Do not print `.env.local`, tokens, database URLs or OpenAI credentials.
- Keep ingestion idempotent and test status/normalisation changes.

## Headless browser testing on squiggle

This is a headless Ubuntu server. Use the repository's npm and pinned Playwright Chromium setup; no interactive desktop, Browser plugin or user-attached tab is needed. Exact installation, start, test and artifact commands are in [`docs/TESTING.md`](docs/TESTING.md). Run the relevant headless interactions for UI changes, inspect desktop/mobile screenshots, and inspect console/network failures before claiming visual verification.

Use isolated ports, browser contexts, data and artifact directories. Default browser workers: one. Stop only processes started for the current task. Keep failure screenshots/traces when useful. Build success or curl alone does not prove UI functionality.

If setup fails, report the exact command/error and missing prerequisite. Reuse installed dependencies/browser binaries before downloading anything; do not introduce a second browser framework.
