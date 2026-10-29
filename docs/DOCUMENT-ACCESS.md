# Officer reports and decision notices: access review

Checked 29 October 2026. No officer-report or decision-notice content was imported, sent to OpenAI, or published during this investigation. No processing fees were incurred. Existing public objection coverage therefore remains unchanged.

## Findings

- Camden's [copyright policy](https://www.camden.gov.uk/en/data-protection-privacy-and-cookies) reserves website copyright to the council unless stated otherwise. It permits acknowledged educational-organisation use and says other use requires written permission. No document-specific grant covering this workflow was verified.
- The planning portal's notice about submitted plans, drawings and materials does not establish a licence for council-authored reports. The Open Government Licence on the Socrata application dataset has not been verified as applying to linked documents.
- A direct request to [the document host's robots policy](https://camdocs.camden.gov.uk/robots.txt) returned HTTP 200 and `User-agent: *` / `Disallow: /`. No document-body downloads followed. Respect this restriction; do not change clients, proxies or URLs to evade it.
- The two discovered Ellerdale Road document URLs returned HTTP 404 to HEAD requests. Their contents and identity remain unverified. A 404 to HEAD alone does not establish that a document has been deleted.
- No explicit blanket licence for Camden committee reports was found. An OGL notice in an unrelated third-party appendix would not license an entire committee pack.

The [IPO's copyright-exceptions guidance](https://www.gov.uk/guidance/exceptions-to-copyright) describes conditional research and quotation exceptions. These are not evidence of an unconditional grant for this application's external AI processing and publication. Record a verified licence, written permission or an assessed applicable basis before setting `authorized: true`.

## Located candidates

[`data/document-candidates.json`](../data/document-candidates.json) records four candidate links for two applications, their discovery source, verification limits and access findings. Public Planning Atlas hyperlink metadata was used only to discover original council URLs. Its summaries and conclusions were not imported as planning evidence.

| Reference                       | Candidate documents                                 | Verification limit                                 |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| 2025/5723/P — 16 Ellerdale Road | Named officer report and decision notice            | Indexed titles only; direct HEAD responses 404     |
| 2026/0593/P — 166 Grafton Road  | Named decision notice and one unclassified document | Not downloaded; application also records an appeal |

These records are not included in analysis statistics or public application evidence.

## Prepared request — not sent

Contact route: [Camden Information Rights](https://www.camden.gov.uk/freedom-information-request). The following is a scoped reuse/access enquiry; requesting access alone should not be treated as a reuse grant. Supply the sender's name and correspondence address when sending.

**Subject: Permission to analyse council-authored planning reports and decision notices**

Hello,

I am developing NIMBYWatch, a public-interest website explaining planning applications and decisions. Please confirm the permitted reuse of Camden-authored officer reports and decision notices, initially for applications 2025/5723/P and 2026/0593/P.

The intended workflow is to obtain the documents through an authorised route, remove personal information about residents, and send relevant text to the OpenAI API for structured analysis. Source text and draft results would be retained privately for editorial checking. After human review, the site would publish summaries, objection categories, explicitly reported counts, and short supporting quotations with document links and page references. Objections, officer assessments and formal decision reasons would be presented separately. We would not republish drawings or whole documents.

Does an existing licence permit this use? If not, would Camden grant written permission and identify any conditions? Please also advise an approved access method, since the document host's robots policy disallows automated access, and the indexed links for the Ellerdale Road documents returned 404 to HEAD requests. Copies supplied directly would also be suitable.

Thank you.

## Resuming ingestion

Once an authorised source is available, use the existing [analysis workflow](ANALYSIS.md). Verify the application reference and document type against each original, retain a private source manifest with its access date, permission evidence, file digest and redaction notes, and preserve original page indices in the supplied text. Empty/redacted leading pages need a neutral placeholder because input trimming removes leading whitespace and form-feed characters.

Submit reports and notices separately through the authenticated API while the local PGlite service is running; do not open the same database from a second process. Each completed result must remain `needs_review`. Check quotations, counts, context and privacy before the existing accuracy/privacy/rights publication attestations. Do not infer formal refusal reasons from an officer recommendation, or a final appeal outcome from an earlier refusal notice.
