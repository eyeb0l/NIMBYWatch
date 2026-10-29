import { createHash } from "node:crypto";
import type {
  Application,
  HousingField,
  HousingMetrics,
  HousingEvidence,
} from "../types";
import type { HousingExtraction } from "../analysis/schema";
export const housingFields: HousingField[] = [
  "proposedUnits",
  "netAdditionalUnits",
  "approvedUnits",
  "affordableUnits",
];
export type HousingCandidate = {
  metrics: HousingExtraction;
  sourceUrl: string;
  sourceTitle: string;
  model: string;
  promptVersion: string;
  extractedAt: string;
  reviewed: boolean;
};
export function descriptionHash(
  application: Pick<Application, "id" | "description" | "sourceUrl">,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        application.id,
        application.description,
        application.sourceUrl,
      ]),
    )
    .digest("hex");
}
export function resolveHousing(
  application: Application,
  candidates: HousingCandidate[] = [],
): HousingMetrics {
  return Object.fromEntries(
    housingFields.map((field) => {
      const structured = application[field];
      if (structured !== null && structured !== undefined)
        return [
          field,
          {
            value: structured,
            provenance: "source_reported",
            evidence: [],
            reason: null,
          },
        ];
      const known = candidates.flatMap((c) => {
        const metric = c.metrics[field];
        return metric?.confidence === "high"
          ? [
              {
                value: metric.value,
                evidence: {
                  quote: metric.quote,
                  page: metric.page,
                  sourceUrl: c.sourceUrl,
                  sourceTitle: c.sourceTitle,
                  model: c.model,
                  promptVersion: c.promptVersion,
                  extractedAt: c.extractedAt,
                  confidence: metric.confidence,
                  reviewed: c.reviewed,
                } satisfies HousingEvidence,
              },
            ]
          : [];
      });
      const values = new Set(known.map((k) => k.value));
      if (values.size === 1)
        return [
          field,
          {
            value: known[0].value,
            provenance: "ai_extracted",
            evidence: known.map((k) => k.evidence),
            reason: null,
          },
        ];
      return [
        field,
        {
          value: null,
          provenance: "unknown",
          evidence: known.map((k) => k.evidence),
          reason:
            values.size > 1
              ? "Conflicting source passages report different quantities."
              : "No reliable explicit quantity has been established.",
        },
      ];
    }),
  ) as HousingMetrics;
}
