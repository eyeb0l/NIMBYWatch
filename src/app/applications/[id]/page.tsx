import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, MapPin, FileText } from "lucide-react";
import { getApplication } from "@/lib/data/repository";
import { getPublishedAnalyses } from "@/lib/analysis/service";
import { dateLabel } from "@/lib/presentation";
import { Status } from "@/components/status";
import { HousingNumbers } from "@/components/housing-numbers";
import { Evidence } from "@/components/evidence";
export const dynamic = "force-dynamic";
export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getApplication(id);
  if (!app) notFound();
  const evidence = await getPublishedAnalyses(id);
  return (
    <main className="content-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} />
        All applications
      </Link>
      <div className="detail-top">
        <div>
          <div className="detail-reference">
            {app.reference}
            <Status status={app.status} />
          </div>
          <h1>{app.address}</h1>
          <p className="location-line">
            <MapPin size={16} />
            {app.ward ?? "Ward not reported"} · {app.authority}
          </p>
        </div>
        <a
          href={app.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="primary-link"
        >
          View council record <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="detail-grid">
        <div>
          <section className="paper-section">
            <div className="section-top">
              <h2>The proposal</h2>
              <span className="fact-label">Source fact</span>
            </div>
            <p className="description">{app.description}</p>
            <dl className="facts">
              <div>
                <dt>Application type</dt>
                <dd>{app.applicationType ?? "Not reported"}</dd>
              </div>
              <div>
                <dt>Source decision</dt>
                <dd>{app.decision ?? "Not reported"}</dd>
              </div>
              <div>
                <dt>Source status</dt>
                <dd>{app.sourceStatus ?? "Not reported"}</dd>
              </div>
              <div>
                <dt>Location precision</dt>
                <dd>{app.coordinateAccuracy}</dd>
              </div>
            </dl>
          </section>
          <HousingNumbers application={app} />
          <section className="paper-section">
            <div className="section-top">
              <h2>Document evidence</h2>
              <span className="fact-label">{evidence.length} reviewed</span>
            </div>
            {evidence.length ? (
              evidence.map((a) => <Evidence key={a.id} analysis={a} />)
            ) : (
              <div className="evidence-empty">
                <FileText size={30} />
                <h3>No reviewed analysis yet</h3>
                <p>
                  Objections, officer recommendations and formal reasons have
                  not been established from source documents for this
                  application.
                </p>
                <Link href={`/analysis?applicationId=${app.id}`}>
                  Analyse an authorised document <ArrowUpRight size={14} />
                </Link>
              </div>
            )}
            <p className="notice">
              Resident objections, officer assessments and formal decision
              reasons are distinct evidence. Their presence together does not
              demonstrate causation.
            </p>
          </section>
        </div>
        <aside>
          <section className="paper-section">
            <h2>Recorded timeline</h2>
            <ol className="timeline">
              <li>
                <strong>Registered</strong>
                <span>{dateLabel(app.registeredDate)}</span>
              </li>
              <li>
                <strong>
                  {app.decisionDate
                    ? "Decision recorded"
                    : "Decision date unavailable"}
                </strong>
                <span>{dateLabel(app.decisionDate)}</span>
                <Status status={app.status} />
              </li>
              <li>
                <strong>Source last updated</strong>
                <span>{dateLabel(app.sourceUpdatedAt)}</span>
              </li>
            </ol>
            <p className="muted">
              Appeals, linked revisions and earlier proposals have not been
              reconstructed.
            </p>
          </section>
          <section className="paper-section">
            <h2>About this record</h2>
            <p className="muted">
              Imported {dateLabel(app.ingestedAt)} from Camden Open Data.
            </p>
            <p className="muted">Included because: {app.residentialBasis}.</p>
            <a
              className="inline-link"
              href={app.datasetUrl}
              target="_blank"
              rel="noreferrer"
            >
              Original open dataset <ArrowUpRight size={14} />
            </a>
            <Link className="inline-link" href="/methodology">
              How we use the data <ArrowUpRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
