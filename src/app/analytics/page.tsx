import { getApplications } from "@/lib/data/repository";
import { getPublishedAnalyses } from "@/lib/analysis/service";
import {
  statusColors,
  statusLabels,
  housingTotals,
  housingLabels,
} from "@/lib/presentation";
import { objectionCategories } from "@/lib/analysis/schema";
import type { PlanningStatus, HousingField } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function Analytics() {
  const [apps, analyses] = await Promise.all([
    getApplications(),
    getPublishedAnalyses(),
  ]);
  const reviewed = analyses.filter(
    (a) => a.documentType !== "application_description",
  );
  const coverage = new Set(reviewed.map((a) => a.applicationId)).size;
  const months = [
    ...new Set(
      apps
        .map((a) => a.registeredDate?.slice(0, 7))
        .filter((s): s is string => Boolean(s)),
    ),
  ].sort();
  const max = Math.max(
    1,
    ...months.map(
      (m) => apps.filter((a) => a.registeredDate?.startsWith(m)).length,
    ),
  );
  const categories = objectionCategories.map((c) => ({
    name: c,
    count: new Set(
      reviewed
        .filter((a) => a.result?.objections.some((o) => o.category === c))
        .map((a) => a.applicationId),
    ).size,
  }));
  return (
    <main className="content-page">
      <div className="page-heading">
        <h1>What the records show.</h1>
        <p>
          Application outcomes and evidence coverage across the imported Camden
          sample.
        </p>
      </div>
      <div className="notice">
        <strong>{apps.length} applications in this dataset.</strong> This is a
        recent residential-related sample, not all Camden planning activity.
        Charts describe records, not homes delivered or lost.
      </div>
      <section className="paper-section" aria-label="Housing evidence coverage">
        <h2>Housing counts, with their evidence</h2>
        <p className="muted">
          Partial sums across application records. Each measure has its own
          evidence and coverage; repeated or revised proposals may describe the
          same homes.
        </p>
        <div className="housing-summary-table">
          <table>
            <thead>
              <tr>
                <th>Measure</th>
                <th>Partial sum</th>
                <th>Source-reported records</th>
                <th>AI-extracted records</th>
                <th>Unknown records</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(housingLabels) as HousingField[]).map((field) => {
                const totals = housingTotals(apps, field);
                return (
                  <tr key={field}>
                    <th scope="row">{housingLabels[field]}</th>
                    <td>{totals.total?.toLocaleString() ?? "Unknown"}</td>
                    <td>
                      {totals.sourceReported} / {apps.length}
                    </td>
                    <td>
                      {totals.aiExtracted} / {apps.length}
                    </td>
                    <td>
                      {totals.unknown} / {apps.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">
          AI-extracted does not mean source-reported or necessarily editorially
          reviewed. Follow each application's supporting evidence. Unknown
          values contribute nothing to the sum, but remain in the coverage
          denominator.
        </p>
      </section>
      <div className="analytics-grid">
        <section className="paper-section">
          <h2>Recorded outcomes</h2>
          <p className="muted">
            Share of all {apps.length} imported applications, including pending
            and withdrawn.
          </p>
          <div className="bars">
            {(Object.keys(statusLabels) as PlanningStatus[]).map((s) => {
              const n = apps.filter((a) => a.status === s).length;
              return (
                <div className="bar-row" key={s}>
                  <span>{statusLabels[s]}</span>
                  <div className="bar-track">
                    <div
                      style={{
                        width: `${apps.length ? (n / apps.length) * 100 : 0}%`,
                        background: statusColors[s],
                      }}
                    />
                  </div>
                  <strong>{n}</strong>
                  <small>
                    {apps.length ? ((n / apps.length) * 100).toFixed(1) : 0}%
                  </small>
                </div>
              );
            })}
          </div>
        </section>
        <section className="paper-section">
          <h2>Objections: the coverage gap</h2>
          <div className="coverage-large">
            {coverage}
            <span>/ {apps.length}</span>
          </div>
          <p className="muted">
            Applications with a reviewed officer report, representation or
            decision notice. Description-only summaries are excluded.
          </p>
          <p>
            {coverage === 0
              ? "No reviewed objection evidence is published yet. Absence of analysis does not mean absence of objections."
              : "Categories count unique applications with cited objections, not individual objectors. Categories can overlap."}
          </p>
          <div className="bars">
            {categories.map((c) => (
              <div className="bar-row category" key={c.name}>
                <span>{c.name.replaceAll("_", " ")}</span>
                <div className="bar-track">
                  <div
                    style={{
                      width: `${coverage ? (c.count / coverage) * 100 : 0}%`,
                      background: "#3659a4",
                    }}
                  />
                </div>
                <strong>{coverage ? c.count : "—"}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="paper-section wide">
          <h2>Applications over time</h2>
          <p className="muted">
            Registration month, segmented by current recorded outcome. This is
            not a time series of decision dates. Most recent months may be
            incomplete.
          </p>
          <div
            className="month-chart"
            role="img"
            aria-label="Application registrations by month and current outcome"
          >
            {months.map((m) => {
              const rows = apps.filter((a) => a.registeredDate?.startsWith(m));
              return (
                <div className="month-col" key={m}>
                  <span>{rows.length}</span>
                  <div
                    className="month-stack"
                    style={{ height: `${(rows.length / max) * 150}px` }}
                  >
                    {(Object.keys(statusLabels) as PlanningStatus[]).map(
                      (s) => {
                        const n = rows.filter((a) => a.status === s).length;
                        return (
                          <div
                            key={s}
                            title={`${m}: ${n} ${statusLabels[s]}`}
                            style={{
                              height: `${(n / rows.length) * 100}%`,
                              background: statusColors[s],
                            }}
                          />
                        );
                      },
                    )}
                  </div>
                  <small>
                    {new Date(`${m}-01`).toLocaleDateString("en-GB", {
                      month: "short",
                      year: "2-digit",
                      timeZone: "UTC",
                    })}
                  </small>
                </div>
              );
            })}
          </div>
          <details className="data-table">
            <summary>View chart data as a table</summary>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  {Object.values(statusLabels).map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m}>
                    <td>{m}</td>
                    {Object.keys(statusLabels).map((s) => (
                      <td key={s}>
                        {
                          apps.filter(
                            (a) =>
                              a.registeredDate?.startsWith(m) && a.status === s,
                          ).length
                        }
                      </td>
                    ))}
                    <td>
                      {
                        apps.filter((a) => a.registeredDate?.startsWith(m))
                          .length
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>
      <p className="notice">
        Housing figures are partial evidence-backed counts, not a measure of
        unique housing supply. Refused applications are not counted as “lost
        homes”; the data does not resolve withdrawals, revisions, duplicate
        proposals, appeals or delivery.
      </p>
    </main>
  );
}
