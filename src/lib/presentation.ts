import type {
  Application,
  PlanningStatus,
  HousingField,
  HousingMetric,
} from "./types";
export const statusLabels: Record<PlanningStatus, string> = {
  approved: "Approved",
  refused: "Refused",
  withdrawn: "Withdrawn",
  pending: "Pending",
  other: "Other",
};
export const statusColors: Record<PlanningStatus, string> = {
  approved: "#168571",
  refused: "#c05358",
  withdrawn: "#8b729b",
  pending: "#c18a29",
  other: "#6d8090",
};
export function dateLabel(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Not reported";
}
export const housingLabels: Record<HousingField, string> = {
  proposedUnits: "Proposed homes",
  netAdditionalUnits: "Net additional homes",
  approvedUnits: "Approved homes",
  affordableUnits: "Affordable homes",
};
export const housingProvenanceLabels = {
  source_reported: "Source-reported",
  ai_extracted: "AI-extracted",
  unknown: "Unknown",
} as const;
export function getHousingMetric(
  app: Application,
  field: HousingField,
): HousingMetric {
  if (app.housing) return app.housing[field];
  return {
    value: app[field],
    provenance: app[field] === null ? "unknown" : "source_reported",
    evidence: [],
    reason:
      app[field] === null
        ? "No explicit evidence established for this measure."
        : null,
  };
}
export function housingTotals(apps: Application[], field: HousingField) {
  const metrics = apps.map((a) => getHousingMetric(a, field));
  const known = metrics.filter((m) => m.value !== null);
  return {
    known: known.length,
    total: known.length ? known.reduce((sum, m) => sum + m.value!, 0) : null,
    sourceReported: metrics.filter(
      (m) => m.provenance === "source_reported" && m.value !== null,
    ).length,
    aiExtracted: metrics.filter(
      (m) => m.provenance === "ai_extracted" && m.value !== null,
    ).length,
    unknown: metrics.filter((m) => m.value === null).length,
  };
}
export function totalKnown(apps: Application[], field: HousingField) {
  const { known, total } = housingTotals(apps, field);
  return { known, total };
}
