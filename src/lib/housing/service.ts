import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { query, transaction, getDatabase } from "../db";
import type { Application } from "../types";
import {
  housingExtractionSchema,
  validateHousingExtraction,
  type HousingExtraction,
  type Submission,
} from "../analysis/schema";
import {
  descriptionHash,
  resolveHousing,
  type HousingCandidate,
} from "./resolve";
import {
  HOUSING_MODEL,
  HOUSING_PROMPT_VERSION,
  HOUSING_SYSTEM_PROMPT,
} from "./prompt";
const MAX_OUTPUT_TOKENS = 1200,
  INPUT_RATE = 0.4,
  OUTPUT_RATE = 1.6;
const emptyMetrics: HousingExtraction = {
  proposedUnits: null,
  netAdditionalUnits: null,
  approvedUnits: null,
  affordableUnits: null,
};
export type HousingRecord = {
  id: string;
  applicationId: string;
  descriptionHash: string;
  model: string;
  promptVersion: string;
  status: "processing" | "complete" | "failed";
  result: HousingExtraction | null;
  reservedCostUsd: number;
  estimatedCostUsd: number | null;
  createdAt: string;
  error: string | null;
};
type Row = Record<string, unknown> & {
  id: string;
  application_id: string;
  description_hash: string;
  model: string;
  prompt_version: string;
  status: HousingRecord["status"];
  result: HousingExtraction | null;
  reserved_cost_usd: string | number;
  estimated_cost_usd: string | number | null;
  created_at: string | Date;
  error: string | null;
};
function record(r: Row): HousingRecord {
  return {
    id: r.id,
    applicationId: r.application_id,
    descriptionHash: r.description_hash,
    model: r.model,
    promptVersion: r.prompt_version,
    status: r.status,
    result: r.result,
    reservedCostUsd: Number(r.reserved_cost_usd),
    estimatedCostUsd:
      r.estimated_cost_usd === null ? null : Number(r.estimated_cost_usd),
    createdAt: new Date(r.created_at).toISOString(),
    error: r.error,
  };
}
export function estimateHousingCost(description: string) {
  return (
    ((Buffer.byteLength(JSON.stringify(description)) + 4096) * INPUT_RATE +
      MAX_OUTPUT_TOKENS * OUTPUT_RATE) /
    1e6
  );
}
function budget(name: string, fallback: number) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${name} must be a positive dollar amount.`);
  return n;
}
/** Conservative source gate: a historical or amended scheme is not a fresh quantity claim. */
export function requiresHousingReview(description: string) {
  return /\b(variation|vary|amendment|amendments|amend|amended|non[- ]material|minor[- ]material|discharge of|retention|retrospective|revised scheme)\b/i.test(
    description,
  );
}
export function validateDescriptionHousing(
  input: unknown,
  application: Application,
): HousingExtraction {
  const result = validateHousingExtraction(
    input,
    application.description,
    "application_description",
  );
  if (requiresHousingReview(application.description))
    return { ...emptyMetrics };
  if (result.proposedUnits) {
    // Alterations to existing homes are not a proposal to create those homes.
    const creates =
      /\b(?:creat\w*|conver\w*|change of use|erection|construction|redevelop\w*|provision|provide|amalgamat\w*|subdivi\w*|new (?:homes?|dwellings?|flats?|apartments?))\b/i.test(
        application.description,
      );
    if (!creates) result.proposedUnits = null;
    else {
      const quote = result.proposedUnits.quote;
      if (/\b(?:existing|retained)\b/i.test(quote)) {
        // Remove explicitly existing quantities before checking whether this value also
        // appears as a current proposed quantity elsewhere in the cited passage.
        const withoutExisting = quote.replace(
          /\b(?:[\d,]+|[a-z]+(?:[ -][a-z]+)?)\s*(?:(?:x|no\.?)\s*)?(?:existing|retained)\s+(?:residential\s+)?(?:homes?|dwellings?|flats?|apartments?|units?)\b/gi,
          "existing homes",
        );
        try {
          validateHousingExtraction(
            {
              ...emptyMetrics,
              proposedUnits: {
                ...result.proposedUnits,
                quote: withoutExisting,
                page: null,
              },
            },
            withoutExisting,
            "application_description",
          );
        } catch {
          result.proposedUnits = null;
        }
      }
      // In a stated conversion, only the destination quantity is proposed; never the existing source quantity.
      const conversion =
        /\b(?:conver\w*|amalgamat\w*|change of use|subdivi\w*)\b/i.test(
          application.description,
        ) &&
        application.description.match(
          /\b(?:from|of)\b[\s\S]*?\b(?:into|to)\b([\s\S]*)/i,
        );
      if (result.proposedUnits && conversion) {
        try {
          validateHousingExtraction(
            {
              ...emptyMetrics,
              proposedUnits: {
                ...result.proposedUnits,
                quote: conversion[1],
                page: null,
              },
            },
            conversion[1],
            "application_description",
          );
        } catch {
          result.proposedUnits = null;
        }
      }
    }
  }
  return result;
}
export type HousingProvider = (
  application: Application,
) => Promise<{ output: unknown; inputTokens: number; outputTokens: number }>;
export const housingOpenAIProvider: HousingProvider = async (application) => {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 45000,
  });
  const result = await client.responses.parse({
    model: HOUSING_MODEL,
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: "system", content: HOUSING_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({ description: application.description }),
      },
    ],
    text: {
      format: zodTextFormat(housingExtractionSchema, "housing_quantities"),
    },
  });
  if (result.status !== "completed" || !result.output_parsed || !result.usage)
    throw new Error(
      "The model did not return complete structured housing evidence.",
    );
  return {
    output: result.output_parsed,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  };
};
export async function extractDescriptionHousing(
  application: Application,
  provider: HousingProvider = housingOpenAIProvider,
): Promise<{ record: HousingRecord; reused: boolean }> {
  const hash = descriptionHash(application);
  const existing = await query<Row>(
    "SELECT * FROM housing_extractions WHERE application_id=$1 AND description_hash=$2 AND model=$3 AND prompt_version=$4",
    [application.id, hash, HOUSING_MODEL, HOUSING_PROMPT_VERSION],
  );
  if (existing.rows[0])
    return { record: record(existing.rows[0]), reused: true };
  if (Buffer.byteLength(application.description) > 24000)
    throw new Error("Description exceeds the 24 KB extraction limit.");
  if (provider === housingOpenAIProvider && !process.env.OPENAI_API_KEY)
    throw new Error("OpenAI key is not configured.");
  const reserve = estimateHousingCost(application.description);
  if (reserve > budget("AI_MAX_DOCUMENT_USD", 0.1))
    throw new Error(
      "Housing extraction exceeds the per-document spending limit.",
    );
  const id = randomUUID();
  const duplicate = await transaction(async (q) => {
    await q(
      "INSERT INTO analysis_budget(day,reserved_usd) VALUES(CURRENT_DATE,0) ON CONFLICT(day) DO NOTHING",
    );
    await q(
      "SELECT day FROM analysis_budget WHERE day=CURRENT_DATE FOR UPDATE",
    );
    const found = await q<Row>(
      "SELECT * FROM housing_extractions WHERE application_id=$1 AND description_hash=$2 AND model=$3 AND prompt_version=$4",
      [application.id, hash, HOUSING_MODEL, HOUSING_PROMPT_VERSION],
    );
    if (found.rows[0]) return found.rows[0];
    const source = await q<{ payload: Application }>(
      "SELECT payload FROM applications WHERE id=$1",
      [application.id],
    );
    if (!source.rows[0] || descriptionHash(source.rows[0].payload) !== hash)
      throw new Error(
        "Application source changed. Reload it before extraction.",
      );
    const reserved = await q(
      "UPDATE analysis_budget SET reserved_usd=reserved_usd+$1 WHERE day=CURRENT_DATE AND reserved_usd+$1 <= $2 RETURNING day",
      [reserve, budget("AI_DAILY_BUDGET_USD", 1)],
    );
    if (!reserved.rows.length)
      throw new Error(
        "Daily analysis spending limit reached. No API request was made.",
      );
    await q(
      "INSERT INTO housing_extractions(id,application_id,description_hash,model,prompt_version,status,reserved_cost_usd) VALUES($1,$2,$3,$4,$5,'processing',$6)",
      [
        id,
        application.id,
        hash,
        HOUSING_MODEL,
        HOUSING_PROMPT_VERSION,
        reserve,
      ],
    );
    return null;
  });
  if (duplicate) return { record: record(duplicate), reused: true };
  try {
    const response = await provider(application);
    const cost =
      (response.inputTokens * INPUT_RATE +
        response.outputTokens * OUTPUT_RATE) /
      1e6;
    await query(
      "UPDATE housing_extractions SET estimated_cost_usd=$2,input_tokens=$3,output_tokens=$4 WHERE id=$1",
      [id, cost, response.inputTokens, response.outputTokens],
    );
    const result = validateDescriptionHousing(response.output, application);
    const saved = await query<Row>(
      "UPDATE housing_extractions SET status='complete',result=$2::jsonb WHERE id=$1 RETURNING *",
      [id, JSON.stringify(result)],
    );
    return { record: record(saved.rows[0]), reused: false };
  } catch (error) {
    const reason =
      error instanceof OpenAI.APIError
        ? `Housing provider failed (HTTP ${error.status ?? "unknown"}).`
        : "Housing evidence could not be extracted or validated. No quantity was published.";
    await query(
      "UPDATE housing_extractions SET status='failed',error=$2 WHERE id=$1",
      [id, reason],
    );
    throw new Error(reason);
  }
}
export async function exportHousingRecords(): Promise<HousingRecord[]> {
  return (
    await query<Row>(
      "SELECT * FROM housing_extractions WHERE status='complete' ORDER BY application_id,created_at",
    )
  ).rows.map(record);
}
/** Trusted, local snapshot import. Revalidates against each current source and never replaces live records. */
export async function importHousingRecords(
  records: HousingRecord[],
): Promise<number> {
  let added = 0;
  for (const item of records) {
    if (
      item.status !== "complete" ||
      !item.result ||
      item.model !== HOUSING_MODEL ||
      item.promptVersion !== HOUSING_PROMPT_VERSION
    )
      continue;
    const app = (
      await query<{ payload: Application }>(
        "SELECT payload FROM applications WHERE id=$1",
        [item.applicationId],
      )
    ).rows[0]?.payload;
    if (!app || descriptionHash(app) !== item.descriptionHash) continue;
    let result: HousingExtraction;
    try {
      result = validateDescriptionHousing(item.result, app);
    } catch {
      continue;
    }
    if (
      !Number.isFinite(item.reservedCostUsd) ||
      item.reservedCostUsd < 0 ||
      typeof item.estimatedCostUsd !== "number" ||
      !Number.isFinite(item.estimatedCostUsd) ||
      item.estimatedCostUsd < 0 ||
      !Number.isFinite(Date.parse(item.createdAt))
    )
      throw new Error("Invalid housing snapshot accounting metadata.");
    const saved = await query(
      `INSERT INTO housing_extractions(id,application_id,description_hash,model,prompt_version,status,result,reserved_cost_usd,estimated_cost_usd,created_at)
    VALUES($1,$2,$3,$4,$5,'complete',$6::jsonb,$7,$8,$9) ON CONFLICT(application_id,description_hash,model,prompt_version) DO NOTHING`,
      [
        item.id,
        item.applicationId,
        item.descriptionHash,
        item.model,
        item.promptVersion,
        JSON.stringify(result),
        item.reservedCostUsd,
        item.estimatedCostUsd,
        item.createdAt,
      ],
    );
    added += saved.rowCount;
  }
  return added;
}
let snapshotRead: Promise<HousingRecord[]> | undefined;
let seededDatabase: unknown;
let seedingSnapshot: Promise<void> | undefined;
export async function seedHousingSnapshot() {
  const database = await getDatabase();
  if (seededDatabase !== database) {
    seededDatabase = database;
    seedingSnapshot = (async () => {
      snapshotRead ??= readFile(
        path.join(process.cwd(), "data", "camden-housing.json"),
        "utf8",
      )
        .then((text) => JSON.parse(text) as HousingRecord[])
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return [];
          throw error;
        });
      const records = await snapshotRead;
      if (records.length) await importHousingRecords(records);
    })().catch((error) => {
      seededDatabase = undefined;
      seedingSnapshot = undefined;
      throw error;
    });
  }
  await seedingSnapshot;
}
export async function hydrateHousing(
  applications: Application[],
): Promise<Application[]> {
  if (!applications.length) return applications;
  const ids = applications.map((a) => a.id);
  const [descriptions, documents] = await Promise.all([
    query<Row>(
      "SELECT * FROM housing_extractions WHERE status='complete' AND application_id=ANY($1::text[])",
      [ids],
    ),
    query<
      Record<string, unknown> & {
        application_id: string;
        result: { housing?: HousingExtraction };
        metadata: {
          title: string;
          sourceUrl: string;
          documentType: Submission["documentType"];
        };
        source_text: string;
        model: string;
        prompt_version: string;
        created_at: string | Date;
      }
    >(
      "SELECT application_id,result,metadata,source_text,model,prompt_version,created_at FROM document_analyses WHERE status='published' AND application_id=ANY($1::text[])",
      [ids],
    ),
  ]);
  return applications.map((app) => {
    const candidates: HousingCandidate[] = [];
    for (const row of descriptions.rows.filter(
      (r) =>
        r.application_id === app.id &&
        r.description_hash === descriptionHash(app),
    )) {
      if (!row.result) continue;
      try {
        const metrics = validateDescriptionHousing(row.result, app);
        candidates.push({
          metrics,
          sourceUrl: app.sourceUrl,
          sourceTitle: "Council application description",
          model: row.model,
          promptVersion: row.prompt_version,
          extractedAt: new Date(row.created_at).toISOString(),
          reviewed: false,
        });
      } catch {
        /* Invalid historical evidence is not a public quantity. */
      }
    }
    for (const row of documents.rows.filter(
      (r) => r.application_id === app.id && r.result?.housing,
    )) {
      if (
        row.metadata.documentType === "application_description" &&
        row.source_text.replace(/\s+/g, " ").trim() !==
          app.description.replace(/\s+/g, " ").trim()
      )
        continue;
      let metrics: HousingExtraction;
      try {
        metrics =
          row.metadata.documentType === "application_description"
            ? validateDescriptionHousing(row.result.housing, app)
            : validateHousingExtraction(
                row.result.housing,
                row.source_text,
                row.metadata.documentType,
              );
      } catch {
        continue;
      }
      candidates.push({
        metrics,
        sourceUrl: row.metadata.sourceUrl,
        sourceTitle: row.metadata.title,
        model: row.model,
        promptVersion: row.prompt_version,
        extractedAt: new Date(row.created_at).toISOString(),
        reviewed: true,
      });
    }
    return { ...app, housing: resolveHousing(app, candidates) };
  });
}
