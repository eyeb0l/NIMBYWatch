import type { AnalysisRecord } from "@/lib/analysis/service";
import type { Claim } from "@/lib/analysis/schema";
import { housingLabels, dateLabel } from "@/lib/presentation";
export function ClaimView({ claim }: { claim: Claim }) {
  return (
    <div className="claim">
      <p>{claim.text}</p>
      <small>AI interpretation · {claim.confidence} confidence</small>
      {claim.citations.map((c, i) => (
        <blockquote key={i}>
          “{c.quote}”
          <cite>{c.page ? `Page ${c.page}` : "Page not supplied"}</cite>
        </blockquote>
      ))}
    </div>
  );
}
export function Evidence({ analysis }: { analysis: AnalysisRecord }) {
  const r = analysis.result;
  if (!r) return null;
  return (
    <article className="evidence">
      <div className="evidence-heading">
        <h3>{analysis.title}</h3>
        <span>{analysis.documentType.replaceAll("_", " ")}</span>
      </div>
      <a
        className="inline-link"
        href={analysis.sourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        Original source document ↗
      </a>
      {r.summary && (
        <>
          <h4>Development summary</h4>
          <ClaimView claim={r.summary} />
        </>
      )}
      {r.housing && (
        <>
          <h4>Housing figures explicitly reported</h4>
          <div className="housing-grid">
            {Object.entries(r.housing).map(([field, count]) => (
              <div key={field} className="claim">
                <strong>{count?.value ?? "Unknown"}</strong>
                <span>
                  {housingLabels[field as keyof typeof housingLabels]}
                </span>
                {count && (
                  <>
                    <small>AI-extracted · {count.confidence} confidence</small>
                    <blockquote>
                      “{count.quote}”
                      <cite>
                        {count.page
                          ? `Page ${count.page}`
                          : "Page not supplied"}
                      </cite>
                    </blockquote>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <h4>Resident objections</h4>
      {r.objections.length ? (
        r.objections.map((o, i) => (
          <div key={i}>
            <strong className="category-label">
              {o.category.replaceAll("_", " ")}
            </strong>
            <ClaimView claim={o.claim} />
          </div>
        ))
      ) : (
        <p className="muted">
          No objection evidence extracted from this document. This does not
          establish that there were no objections.
        </p>
      )}
      {r.representationCount && (
        <div className="claim">
          <p>
            {r.representationCount.value} {r.representationCount.kind}{" "}
            explicitly reported
          </p>
          <blockquote>
            “{r.representationCount.citation.quote}”
            <cite>
              {r.representationCount.citation.page
                ? `Page ${r.representationCount.citation.page}`
                : "Page not supplied"}
            </cite>
          </blockquote>
        </div>
      )}
      <h4>Officer assessment & recommendation</h4>
      {r.officerAssessment.map((c, i) => (
        <ClaimView key={i} claim={c} />
      ))}
      {r.officerRecommendation ? (
        <ClaimView claim={r.officerRecommendation} />
      ) : (
        <p className="muted">
          Recommendation not extracted from this document.
        </p>
      )}
      <h4>Formal decision reasons & conditions</h4>
      {[...r.refusalReasons, ...r.approvalConditions].length ? (
        [...r.refusalReasons, ...r.approvalConditions].map((c, i) => (
          <ClaimView key={i} claim={c} />
        ))
      ) : (
        <p className="muted">
          No formal decision reasons or conditions extracted.
        </p>
      )}
      {r.limitations.length > 0 && (
        <div className="notice">
          <strong>Limitations</strong>
          <ul>
            {r.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="provenance">
        Model {analysis.model} · Prompt {analysis.promptVersion} · Processed{" "}
        {dateLabel(analysis.createdAt)} ·{" "}
        {analysis.reviewedAt
          ? `Reviewed ${dateLabel(analysis.reviewedAt)}`
          : "Private draft; not reviewed"}{" "}
        · Estimated API cost $
        {analysis.estimatedCostUsd?.toFixed(5) ?? "unknown"}
      </p>
    </article>
  );
}
