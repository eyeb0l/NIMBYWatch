import { getApplications } from "@/lib/data/repository";
import { AnalysisWorkbench } from "@/components/analysis-workbench";
export const dynamic = "force-dynamic";
export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string }>;
}) {
  const [apps, params] = await Promise.all([getApplications(), searchParams]);
  return (
    <main className="content-page analysis-page">
      <div className="page-heading">
        <h1>From documents to evidence.</h1>
        <p>
          A private workspace for authorised source material. Nothing is
          published automatically.
        </p>
      </div>
      <div className="notice">
        <strong>Operator access required.</strong> Analysis uses the OpenAI API
        with a per-document cap and a shared daily budget. Upload only material
        you are authorised to process. No planning drawings or unredacted
        personal information.
      </div>
      <AnalysisWorkbench
        applications={apps}
        initialId={params.applicationId ?? ""}
      />
    </main>
  );
}
