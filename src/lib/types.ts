export type PlanningStatus =
  "approved" | "refused" | "withdrawn" | "pending" | "other";
export type Application = {
  id: string;
  reference: string;
  authority: string;
  address: string;
  ward: string | null;
  description: string;
  applicationType: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateAccuracy: string;
  registeredDate: string | null;
  decisionDate: string | null;
  status: PlanningStatus;
  sourceStatus: string | null;
  decision: string | null;
  proposedUnits: number | null;
  netAdditionalUnits: number | null;
  approvedUnits: number | null;
  affordableUnits: number | null;
  sourceUrl: string;
  datasetUrl: string;
  sourceUpdatedAt: string | null;
  ingestedAt: string;
  residentialBasis: string;
  /** Derived presentation only; raw numeric fields remain council structured values. */
  housing?: HousingMetrics;
};

export type HousingField =
  "proposedUnits" | "netAdditionalUnits" | "approvedUnits" | "affordableUnits";
export type HousingEvidence = {
  quote: string;
  page: number | null;
  sourceUrl: string;
  sourceTitle: string;
  model: string | null;
  promptVersion: string | null;
  extractedAt: string | null;
  confidence: "high" | "medium" | "low" | null;
  reviewed: boolean;
};
export type HousingMetric = {
  value: number | null;
  provenance: "source_reported" | "ai_extracted" | "unknown";
  evidence: HousingEvidence[];
  reason: string | null;
};
export type HousingMetrics = Record<HousingField, HousingMetric>;
