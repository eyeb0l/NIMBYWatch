# Data sources and reuse review

Verified 29 October 2026. NIMBYWatch distinguishes availability from permission to republish. The checked-in records are **real Camden source records**, not examples or AI-generated data.

## Camden Open Data — active ingestion

- Dataset: https://opendata.camden.gov.uk/Environment/Planning-Applications/2eiu-s2cw
- SODA JSON endpoint: https://opendata.camden.gov.uk/resource/2eiu-s2cw.json
- Schema and licence metadata: https://opendata.camden.gov.uk/api/views/2eiu-s2cw.json
- API documentation: https://dev.socrata.com/foundry/opendata.camden.gov.uk/2eiu-s2cw
- Metadata reports `UK_OGLV3.0` (Open Government Licence v3.0), publisher London Borough of Camden, daily updates. A compact verified metadata copy is committed in `data/source-metadata.json`.
- Credit: **London Borough of Camden. Contains OS data © Crown copyright and database right 2026.** Licence: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
- `robots.txt` was accessible and declares `Crawl-delay: 1`; `/resource/` API access is not disallowed. The importer makes one bounded API request per run, with a 30-second timeout. Do not run parallel imports. HTTP failures including 429 stop ingestion; retry later rather than defeating rate limits. An optional `SOCRATA_APP_TOKEN` can identify the application.

The verified schema provides references, addresses, descriptions, registered/decision dates, decision and system status, ward, point coordinates, record URLs and last-upload timestamps. It **does not provide proposed, net additional, approved or affordable housing-unit columns**. The four structured-source quantities are therefore stored independently as `null`; AI extraction never overwrites those council fields. The presentation distinguishes **Source-reported** values supplied by a structured council field, **AI-extracted** values explicitly stated in a source description or authorised document with supporting passages, and **Unknown** values that cannot be established reliably. A housing count is not inferred merely because a number occurs in prose: beds, existing units, historic permissions, incidental references and ambiguous descriptions are not proposed-home totals. Net additional, affordable and approved homes each require their own explicit evidence; an approval status alone does not establish an approved-home count. `last_uploaded` is the source's upload timestamp, not a guarantee that each substantive record changed then.

Description extraction retains the source text hash, source link, model, prompt version, processing time and exact supporting quotation. A changed description invalidates its earlier extraction; conflicting extracted values stay unknown rather than silently choosing one. Authorised-document findings contribute only after the existing accuracy, privacy and publication-rights review. Aggregate housing figures disclose source-reported and AI-extracted coverage separately and remain partial sums across application records, not a count of unique homes or sites.

Although individual rows say “Plotted by Camden Officer”, dataset metadata says published geometry is located to the nearest postcode, derived from OS Code-Point Open; site extents cannot be published under the same licence. The UI therefore labels coordinates approximate. Do not interpret them as parcel boundaries.

### Sample definition and limitations

The initial sample contains 176 unique records, selected from the latest 300 full-planning and householder rows whose descriptions contain residential, dwelling, flat or Class C3 terms. A second conservative filter rejects flat-roof-only matches. It covers residential-related applications, **including alterations, amalgamations, conversions and mixed uses**; it is not a count of new homes or unique development sites. The API order is registered date descending and reference ascending. Future runs fetch up to 300 candidates and retain the requested 100–200 unique matches.

This is a bounded convenience sample, not an exhaustive borough dataset or a representative time series. Older applications can receive later decisions. Appeals, amendments and resubmissions are not linked into development histories. Where the source gives an appeal status, the original decision is retained and the literal status remains visible; no appeal outcome is invented. Approval includes permissions subject to conditions/agreements, not evidence of construction.

The manifest in `data/ingestion-manifest.json` records query, fetch time, record count, digest, licence and selection. A repeat import upserts on stable authority/reference-derived ID. Unchanged payloads do not update timestamps or create duplicates. New records accumulate; ingestion does not delete previous applications. No applicant names, case officers, comment links or contact fields are selected or retained. Published site addresses describe the application site, not objectors.

## GLA Planning London Datahub — verified, not imported

- Requested overview: https://www.london.gov.uk/programmes-strategies/planning/digital-planning/planning-london-datahub (returned HTTP 403 to this research client).
- Official API guide: https://www.london.gov.uk/sites/default/files/planninglondondatahub_api_connection_technical_documentation_v1.pdf
- Documented read-only Elasticsearch endpoint: `https://planningdata.london.gov.uk/api-guest/`.
- The official guide publishes a guest request header. A bounded `applications/_search?size=1` request with that documented header returned HTTP 200 on the verification date. No access control was bypassed. `robots.txt` returned 404.
- Guide describes `applications`, `residential_units`, floorspace, other residential accommodation and open-space indices. A real response includes `lpa_app_no`, `borough`, `description`, `decision`, `status`, `decision_date`, `last_updated`, and nested residential information. These are potentially useful for explicit housing totals and cross-borough expansion.

A clear first-party redistribution licence for this particular guest dataset was **not verified** in this session. The fact an endpoint is readable is insufficient evidence of reuse permission. Consequently no GLA records or unit totals are published or joined into this MVP. Before enabling an adapter, verify the current grant and schema, distinguish existing/proposed and gross/net units, match exact authority/reference, preserve field-level provenance, and review duplicate or superseded schemes. Camden's licensed API provides the working vertical slice meanwhile.

## Camden planning portal — link only

https://planningrecords.camden.gov.uk/northgate/planningexplorer/home.aspx is accessible. Its copyright notice restricts submitted plans, drawings and materials to consultation/comparison/completion-checking uses, and says further copies require the copyright owner's permission. Public accessibility does not grant blanket redistribution rights.

This application stores Camden's supplied original-record link. It does not crawl or republish planning drawings or bulk-download documents. The analysis workflow accepts only operator-supplied text/documents for which the operator confirms permission, with private draft review before publishing redacted findings. Automated portal document discovery remains out of scope pending permission and access-policy review.

A subsequent bounded document-access investigation located report/notice link metadata for two existing applications, but verified neither permitted automated access nor reuse for the intended workflow. The document host's robots policy disallows all paths. See [the access findings and unsent permission enquiry](DOCUMENT-ACCESS.md) and [candidate metadata](../data/document-candidates.json). These are discovery records, not document analyses; they do not increase coverage.
