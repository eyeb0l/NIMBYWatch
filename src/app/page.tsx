import { getApplications } from "@/lib/data/repository";
import { getPublishedAnalyses } from "@/lib/analysis/service";
import { Explorer } from "@/components/explorer";
export const dynamic = "force-dynamic";
export default async function Home() {
  const [apps, analyses] = await Promise.all([
    getApplications(),
    getPublishedAnalyses(),
  ]);
  return (
    <Explorer
      applications={apps}
      coverage={analyses.map((a) => ({
        applicationId: a.applicationId,
        categories: a.result?.objections.map((o) => o.category) ?? [],
        hasObjectionEvidence: a.documentType !== "application_description",
      }))}
    />
  );
}
