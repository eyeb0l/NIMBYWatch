# Document analysis and editorial review

The MVP accepts operator-authorised text and `.txt` uploads. It does not fetch planning documents, download drawings, extract PDFs or bypass portal restrictions. Copy text only when you have permission to process it, remove objectors' personal information first, and retain the original document for review. A page's public availability does not grant unrestricted republication rights.

## Processing

1. Import the application, then choose its ID (for example `camden-2026-3743-P`).
2. Configure server-only `OPENAI_API_KEY` and `ADMIN_TOKEN` (at least 24 characters). The operator form sends the token in an Authorization header, never a URL. Do not store it in browser local storage.
3. Submit a title, original source URL, document type and authorised text. Types are `officer_report`, `decision_notice`, `representation`, and `application_description`. The last supports a development summary and explicitly stated proposed/net/affordable housing quantities; it must not count as objection-analysis coverage.
4. The server validates the request, atomically reserves a spending allowance, calls OpenAI once, validates structured output, and checks every quotation against the supplied source. It stores a private draft with status `needs_review`. Raw text and drafts are never served by public queries.
5. An editor checks every claim, its attribution, quotation, reuse rights, and the absence of objectors' identifying information. Only then confirm all three publication attestations. Publication never changes application source status or structured housing counts. Reviewed housing extractions can contribute separate, visibly labelled AI-extracted measures.

Paste or upload UTF-8 text, at most 60,000 characters and 120 KB. Preserve page boundaries as form-feed characters (`\f`) if page indices are known. Otherwise every citation has `page: null`; the pipeline never invents PDF pagination. Page indices refer to the supplied text, which may differ from printed pagination.

## CLI

From the repository root:

```sh
npm run analyze -- /absolute/path/to/authorised-document.json
```

The command loads `.env.local`. Input JSON has:

```json
{
  "applicationId": "camden-2026-3743-P",
  "documentType": "application_description",
  "title": "Camden open-data description: 2026/3743/P",
  "sourceUrl": "https://opendata.camden.gov.uk/Environment/Planning-Applications/2eiu-s2cw",
  "text": "Copy the authorised source text here, without private objector information.",
  "authorized": true
}
```

The illustrative sentence above is not a planning record. Use actual source text. Store input documents outside Git. CLI output contains only the run ID, status, model, estimated cost and reuse indicator; inspect drafts through the authenticated operator interface/API.

Do not run a separate CLI against a PGlite directory currently opened by the app. Stop the app first, or use PostgreSQL for concurrent processes.

## API contracts

All administrative routes require `Authorization: Bearer <ADMIN_TOKEN>` and respond with `Cache-Control: no-store`. Missing/short server tokens disable access. The key remains server-side.

- `POST /api/analysis` accepts the JSON above and returns `{analysis, reused}`.
- `GET /api/analysis?applicationId=...` returns `{analyses}` for editorial review, including failed attempts.
- `POST /api/analysis/<id>/review` accepts `{privacyReviewed:true, accuracyReviewed:true, rightsConfirmed:true}`. It revalidates persisted evidence and publishes only completed drafts. Client-supplied replacement analysis is not accepted.

New results also contain a `housing` object with four independent nullable quantities: `proposedUnits`, `netAdditionalUnits`, `approvedUnits`, and `affordableUnits`. Each non-null quantity has `{value, quote, page, confidence}`. Older results without this object remain readable as unknown housing. Structured council values retain precedence over extracted evidence. `netAdditionalUnits` may be negative for an explicitly reported net loss; the other measures must be nonnegative integers. A value is accepted only when its exact source passage explicitly connects that number to residential units and its measure. Ranges, approximations, sums, bedroom/floor counts, and numbers borrowed from another measure are rejected. This validation cannot establish every contextual interpretation; publication review remains necessary.

Each result contains nullable cited `summary`, `objections` with category and cited claim, nullable explicit `representationCount` and its kind, separate `officerAssessment`, nullable `officerRecommendation`, separate formal `refusalReasons`, `approvalConditions`, and `limitations`. Every claim includes a confidence flag and one or more source quotations. Formal reasons and conditions require a decision-notice input. Resident representations cannot establish officer findings, formal decisions or housing quantities. Approved housing requires a decision notice explicitly granting that quantity. Proposed homes are never silently copied into net additional, approved or affordable fields.

Server code uses `getPublishedAnalyses(applicationId?)` for public results. Aggregate category counts mean applications with a reviewed objection in that category, not people or letters. Deduplicate by application ID; an application can have several documents and categories. Count only eligible reviewed documents in analysis coverage. Null means unknown, never zero. Quotations matching the source do not prove an interpretation is correct; editorial accuracy review is essential.

## Spending, idempotency and recovery

The model is pinned to `gpt-4.1-mini-2025-04-14`; prompt version is recorded. The Responses API uses Zod structured outputs, `store:false`, a 45-second timeout, maximum 6,000 output tokens and zero SDK retries. No external tools are enabled. Provider data-retention policy still applies: `store:false` is not a guarantee of zero retention.

Defaults:

| Variable              | Default | Purpose                                                                 |
| --------------------- | ------- | ----------------------------------------------------------------------- |
| `AI_MAX_DOCUMENT_USD` | `0.10`  | Reject a request whose conservative upper estimate exceeds this amount  |
| `AI_DAILY_BUDGET_USD` | `1`     | Atomic daily reservation limit shared by all workers using the database |

Reservations use source UTF-8 bytes (a conservative token upper bound), prompt/schema allowance and the output cap. Rates are $0.40 per million input tokens and $1.60 per million output tokens, verified from [OpenAI's model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini) on 2026-10-29. Actual estimated cost is recorded from returned usage; cached-input savings are deliberately ignored. Prices can change; verify before deployment. The database ledger retains the full reservation even after success or failure, intentionally making the daily cap conservative. Configure provider-side project spending limits as a second control.

The document hash includes text, type, title and source URL; uniqueness also includes application ID, pinned model and prompt version. Unchanged documents return the existing attempt without paying again. Concurrent submissions cannot double-spend. Failed or interrupted `processing` attempts are not automatically retried: a timeout can still incur provider charges. An operator must investigate account/network state and provider logs before deliberately clearing a failed attempt in the database. Do not release its daily reservation. For an interrupted `processing` attempt, first confirm the provider call has finished. A future job queue can add an explicit audited retry workflow.

The schema and prompt protect evidence attribution; exact-quote checks reject fabricated passages and guessed pages. A contact-detail heuristic rejects emails and likely phone numbers, but it cannot reliably detect names or all identifiers. Human review is therefore mandatory before public release. Editorial staff can unpublish incorrect output with an authorised database update to `needs_review`; public readers never have write access.

## Verification

`tests/analysis.test.ts` uses clearly labelled synthetic fixtures for legacy/new housing schemas, independent evidence-backed quantities, signed net loss, explicit zero, wrong-unit/measure rejection, exact quotes/page validation, missing-data handling, evidence-type separation, fabricated quote/page rejection, personal-contact rejection, authentication, hash stability, concurrent idempotency, spending reservations and publication gating. It does not assert real-model quality.

Live verification, when an authorised API key is configured, is recorded separately in `artifacts/ai-live-validation.json`. A real Camden open-data application description is a lawful, minimal pipeline check. It is not an officer report or objection, does not validate those extraction tasks, and is kept unpublished. Actual officer-report and representation quality still requires authorised documents and editorial evaluation.

Implementation follows the official [Responses structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
