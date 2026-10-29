import type { Application, PlanningStatus } from "../types";
export const CAMDEN_DATASET = "https://opendata.camden.gov.uk/Environment/Planning-Applications/2eiu-s2cw";
export const CAMDEN_ENDPOINT = "https://opendata.camden.gov.uk/resource/2eiu-s2cw.json";
export const CAMDEN_FIELDS = "pk,application_number,development_address,development_description,decision_type,registered_date,decision_date,system_status,ward,full_application,application_type,longitude,latitude,spatial_accuracy,last_uploaded";
export const CAMDEN_WHERE = "(application_type = 'Full Planning Permission' OR application_type = 'Householder Application') AND (upper(development_description) like '%RESIDENTIAL%' OR upper(development_description) like '%DWELLING%' OR upper(development_description) like '%FLAT%' OR upper(development_description) like '%CLASS C3%')";
export type CamdenRow = Record<string, unknown>;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
export function mapStatus(decision: unknown, status: unknown): PlanningStatus {
  const d = text(decision)?.toLowerCase() ?? "";
  const s = text(status)?.toLowerCase() ?? "";
  if (d.includes("withdrawn") || s === "withdrawn") return "withdrawn";
  if (/^refused(?:\s|$)/.test(d)) return "refused";
  if (/^granted(?:\s|$)/.test(d)) return "approved";
  if (["registered", "awaiting decision", "under consideration", "pending"].includes(s)) return "pending";
  return "other";
}
export function residentialBasis(row: CamdenRow): string | null {
  if (row.application_type === "Householder Application") return "Householder application; may alter existing housing without adding homes.";
  const description = text(row.development_description) ?? "";
  if (/\b(residential|dwelling\w*|class\s*c3|flats(?!\s+roofs?)|flat(?!\s+roof))\b/i.test(description)) return "Residential term in the published description; includes alterations, conversions and mixed use. Not a confirmed net housing gain.";
  return null;
}
function date(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText || !/^\d{4}-\d{2}-\d{2}/.test(valueText) || !Number.isFinite(Date.parse(valueText))) return null;
  return valueText.slice(0, 10);
}
function coordinate(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
export function normalizeCamden(row: CamdenRow, ingestedAt: string): Application | null {
  const reference = text(row.application_number);
  const basis = residentialBasis(row);
  if (!reference || !basis) return null;
  const link = row.full_application as { url?: unknown } | undefined;
  let sourceUrl = CAMDEN_DATASET;
  try {
    const url = new URL(String(link?.url ?? ""));
    if (url.protocol === "https:" && url.hostname === "planningrecords.camden.gov.uk") sourceUrl = url.toString();
  } catch { /* Missing record link remains an explicit dataset link. */ }
  const longitude = coordinate(row.longitude, -180, 180);
  const latitude = coordinate(row.latitude, -90, 90);
  return {
    id: `camden-${reference.replaceAll("/", "-")}`, reference, authority: "Camden",
    address: text(row.development_address) ?? "Address unavailable", ward: text(row.ward),
    description: text(row.development_description) ?? "Description unavailable", applicationType: text(row.application_type),
    latitude, longitude, coordinateAccuracy: "Approximate point; dataset metadata specifies nearest postcode. Not a site boundary.",
    registeredDate: date(row.registered_date), decisionDate: date(row.decision_date),
    status: mapStatus(row.decision_type, row.system_status), sourceStatus: text(row.system_status), decision: text(row.decision_type),
    proposedUnits: null, netAdditionalUnits: null, approvedUnits: null, affordableUnits: null,
    sourceUrl, datasetUrl: CAMDEN_DATASET, sourceUpdatedAt: text(row.last_uploaded), ingestedAt, residentialBasis: basis,
  };
}
export function camdenUrl(limit = 200, offset = 0): string {
  const url = new URL(CAMDEN_ENDPOINT);
  url.searchParams.set("$select", CAMDEN_FIELDS);
  url.searchParams.set("$where", CAMDEN_WHERE);
  url.searchParams.set("$order", "registered_date DESC, application_number ASC");
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set("$offset", String(offset));
  return url.toString();
}
