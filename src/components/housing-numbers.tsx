import type { Application, HousingField } from "@/lib/types";
import {
  dateLabel,
  getHousingMetric,
  housingLabels,
  housingProvenanceLabels,
} from "@/lib/presentation";
export function HousingNumbers({ application }: { application: Application }) {
  return (
    <section className="paper-section" aria-label="Housing numbers">
      <div className="section-top">
        <h2>Housing numbers</h2>
        <span className="fact-label">Evidence for each measure</span>
      </div>
      <div className="housing-grid">
        {(Object.keys(housingLabels) as HousingField[]).map((field) => {
          const metric = getHousingMetric(application, field);
          return (
            <div
              key={field}
              className="housing-metric"
              data-testid={`housing-${field}`}
            >
              <strong className="housing-value">
                {metric.value?.toLocaleString() ?? "Unknown"}
              </strong>
              <span>{housingLabels[field]}</span>
              <div className={`housing-provenance ${metric.provenance}`}>
                {housingProvenanceLabels[metric.provenance]}
              </div>
              {metric.reason && (
                <p className="housing-reason">{metric.reason}</p>
              )}
              {metric.evidence.length > 0 && (
                <details className="housing-evidence">
                  <summary>View supporting evidence</summary>
                  {metric.evidence.map((e, i) => (
                    <div key={i}>
                      {e.quote && <blockquote>“{e.quote}”</blockquote>}
                      <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                        {e.sourceTitle} ↗
                      </a>
                      <p>
                        {e.page ? `Page ${e.page}` : "Page not supplied"}
                        {e.confidence ? ` · ${e.confidence} confidence` : ""}
                      </p>
                      {e.model && (
                        <p>
                          AI extraction ·{" "}
                          {e.reviewed
                            ? "Document reviewed"
                            : "Not editorially reviewed"}
                          <br />
                          {e.model} · {e.promptVersion}
                          <br />
                          Extracted {dateLabel(e.extractedAt)}
                        </p>
                      )}
                    </div>
                  ))}
                </details>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted housing-explanation">
        <strong>Source-reported</strong> comes from a structured council field.{" "}
        <strong>AI-extracted</strong> is explicitly stated in the linked source,
        with a checked quotation. <strong>Unknown</strong> means the measure
        cannot be established reliably. An extracted proposal count does not
        establish net gain, affordability or approval.
      </p>
    </section>
  );
}
