import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { query, transaction } from "../db";
import {
  analysisOutputSchema,
  submissionSchema,
  validateGrounding,
  type AnalysisResult,
  type Submission,
} from "./schema";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";

export const MODEL = "gpt-4.1-mini-2025-04-14";
const INPUT_USD_PER_MILLION = 0.4;
const OUTPUT_USD_PER_MILLION = 1.6;
const MAX_OUTPUT_TOKENS = 6000;
export class AnalysisError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type AnalysisRecord = {
  id: string;
  applicationId: string;
  status: "processing" | "needs_review" | "published" | "failed";
  documentType: Submission["documentType"];
  title: string;
  sourceUrl: string;
  documentHash: string;
  model: string;
  promptVersion: string;
  estimatedCostUsd: number | null;
  createdAt: string;
  reviewedAt: string | null;
  result: AnalysisResult | null;
  error: string | null;
};
type Row = Record<string, unknown> & {
  id: string;
  application_id: string;
  status: AnalysisRecord["status"];
  metadata: Pick<Submission, "title" | "sourceUrl" | "documentType">;
  document_hash: string;
  model: string;
  prompt_version: string;
  estimated_cost_usd: string | number | null;
  created_at: Date | string;
  reviewed_at: Date | string | null;
  result: AnalysisResult | null;
  error: string | null;
};
const iso = (value: Date | string) => new Date(value).toISOString();
function record(row: Row): AnalysisRecord {
  return {
    id: row.id,
    applicationId: row.application_id,
    status: row.status,
    ...row.metadata,
    documentHash: row.document_hash,
    model: row.model,
    promptVersion: row.prompt_version,
    estimatedCostUsd:
      row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
    createdAt: iso(row.created_at),
    reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : null,
    result: row.result,
    error: row.error,
  };
}
export function documentHash(submission: Submission) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        submission.documentType,
        submission.title,
        submission.sourceUrl,
        submission.text,
      ]),
    )
    .digest("hex");
}
function serialiseDocument(
  text: string,
  title = "",
  documentType: Submission["documentType"] = "officer_report",
) {
  return JSON.stringify({
    documentType,
    title,
    pages: text.split("\f").map((text, index, pages) => ({
      page: pages.length > 1 ? index + 1 : null,
      text,
    })),
  });
}
export function estimateUpperCost(text: string, title = ""): number {
  // Count the exact escaped page-wrapper shape, including pathological page breaks.
  // UTF-8 bytes upper-bound byte-level tokens; allowance covers prompt and schema.
  return (
    ((Buffer.byteLength(
      serialiseDocument(text, title, "application_description"),
      "utf8",
    ) +
      16384) *
      INPUT_USD_PER_MILLION +
      MAX_OUTPUT_TOKENS * OUTPUT_USD_PER_MILLION) /
    1_000_000
  );
}
function limit(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0)
    throw new AnalysisError(`${name} must be a positive dollar amount.`, 503);
  return value;
}
export async function getPublishedAnalyses(
  applicationId?: string,
): Promise<AnalysisRecord[]> {
  const result = await query<Row>(
    `SELECT * FROM document_analyses WHERE status='published' ${applicationId ? "AND application_id=$1" : ""} ORDER BY created_at DESC`,
    applicationId ? [applicationId] : [],
  );
  return result.rows.map(record);
}
export async function getAnalysisDrafts(
  applicationId: string,
): Promise<AnalysisRecord[]> {
  const result = await query<Row>(
    "SELECT * FROM document_analyses WHERE application_id=$1 ORDER BY created_at DESC",
    [applicationId],
  );
  return result.rows.map(record);
}
export async function reviewAnalysis(id: string): Promise<AnalysisRecord> {
  return transaction(async (sql) => {
    const { rows } = await sql<Row>(
      "SELECT * FROM document_analyses WHERE id=$1 FOR UPDATE",
      [id],
    );
    const row = rows[0];
    if (!row) throw new AnalysisError("Analysis not found.", 404);
    if (row.status === "published") return record(row);
    if (row.status !== "needs_review" || !row.result)
      throw new AnalysisError("Only completed drafts can be published.", 409);
    // Recheck persisted evidence, never trust a client's replacement JSON.
    validateGrounding(
      row.result,
      String(row.source_text),
      row.metadata.documentType,
    );
    const updated = await sql<Row>(
      "UPDATE document_analyses SET status='published', reviewed_at=now() WHERE id=$1 RETURNING *",
      [id],
    );
    return record(updated.rows[0]);
  });
}
export type ProviderResult = {
  output: unknown;
  inputTokens: number;
  outputTokens: number;
};
export type Provider = (submission: Submission) => Promise<ProviderResult>;
export async function openAIProvider(
  submission: Submission,
): Promise<ProviderResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: 45000,
  });
  const response = await client.responses.parse({
    model: MODEL,
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: serialiseDocument(
          submission.text,
          submission.title,
          submission.documentType,
        ),
      },
    ],
    text: { format: zodTextFormat(analysisOutputSchema, "planning_evidence") },
  });
  if (
    response.status !== "completed" ||
    !response.output_parsed ||
    !response.usage
  ) {
    throw new AnalysisError(
      "The model did not return complete structured evidence. No result was published.",
      502,
    );
  }
  return {
    output: response.output_parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
export async function analyseDocument(
  input: unknown,
  provider: Provider = openAIProvider,
): Promise<{ analysis: AnalysisRecord; reused: boolean }> {
  const submission = submissionSchema.parse(input);
  if (Buffer.byteLength(submission.text, "utf8") > 120000)
    throw new AnalysisError("Document exceeds the 120 KB text limit.");
  const hash = documentHash(submission);
  const reserved = estimateUpperCost(submission.text, submission.title);
  if (reserved > limit("AI_MAX_DOCUMENT_USD", 0.1))
    throw new AnalysisError(
      "Estimated maximum cost exceeds the per-document spending limit.",
      422,
    );
  const dailyLimit = limit("AI_DAILY_BUDGET_USD", 1);
  const existing = await query<Row>(
    "SELECT * FROM document_analyses WHERE application_id=$1 AND document_hash=$2 AND model=$3 AND prompt_version=$4",
    [submission.applicationId, hash, MODEL, PROMPT_VERSION],
  );
  if (existing.rows[0])
    return { analysis: record(existing.rows[0]), reused: true };
  if (provider === openAIProvider && !process.env.OPENAI_API_KEY)
    throw new AnalysisError(
      "Document analysis is not configured. The operator must configure the OpenAI key on the server.",
      503,
    );
  const id = randomUUID();
  const reservedRow = await transaction(async (sql) => {
    // A single daily ledger row serialises reservations across processes/serverless instances.
    await sql(
      "INSERT INTO analysis_budget(day,reserved_usd) VALUES (CURRENT_DATE,0) ON CONFLICT(day) DO NOTHING",
    );
    await sql(
      "SELECT day FROM analysis_budget WHERE day=CURRENT_DATE FOR UPDATE",
    );
    const duplicate = await sql<Row>(
      "SELECT * FROM document_analyses WHERE application_id=$1 AND document_hash=$2 AND model=$3 AND prompt_version=$4",
      [submission.applicationId, hash, MODEL, PROMPT_VERSION],
    );
    if (duplicate.rows[0]) return duplicate.rows[0];
    const application = await sql("SELECT id FROM applications WHERE id=$1", [
      submission.applicationId,
    ]);
    if (!application.rows.length)
      throw new AnalysisError(
        "Application not found. Import it before analysing documents.",
        404,
      );
    const budget = await sql(
      "UPDATE analysis_budget SET reserved_usd=reserved_usd+$1 WHERE day=CURRENT_DATE AND reserved_usd+$1 <= $2 RETURNING day",
      [reserved, dailyLimit],
    );
    if (!budget.rows.length)
      throw new AnalysisError(
        "Daily analysis spending limit reached. No API request was made.",
        429,
      );
    const metadata = {
      documentType: submission.documentType,
      title: submission.title,
      sourceUrl: submission.sourceUrl,
    };
    await sql(
      `INSERT INTO document_analyses(id,application_id,document_hash,model,prompt_version,status,metadata,source_text,reserved_cost_usd)
      VALUES($1,$2,$3,$4,$5,'processing',$6::jsonb,$7,$8)`,
      [
        id,
        submission.applicationId,
        hash,
        MODEL,
        PROMPT_VERSION,
        JSON.stringify(metadata),
        submission.text,
        reserved,
      ],
    );
    return null;
  });
  if (reservedRow) return { analysis: record(reservedRow), reused: true };
  let actualCost: number | null = null;
  try {
    const response = await provider(submission);
    actualCost =
      (response.inputTokens * INPUT_USD_PER_MILLION +
        response.outputTokens * OUTPUT_USD_PER_MILLION) /
      1_000_000;
    // Usage accounting survives grounding failures, which still incur API cost.
    await query(
      "UPDATE document_analyses SET estimated_cost_usd=$2,input_tokens=$3,output_tokens=$4 WHERE id=$1",
      [id, actualCost, response.inputTokens, response.outputTokens],
    );
    const result = validateGrounding(
      response.output,
      submission.text,
      submission.documentType,
    );
    const saved = await query<Row>(
      "UPDATE document_analyses SET status='needs_review',result=$2::jsonb WHERE id=$1 RETURNING *",
      [id, JSON.stringify(result)],
    );
    return { analysis: record(saved.rows[0]), reused: false };
  } catch (error) {
    // Do not store raw provider errors: they can contain submitted text or credential details.
    const reason =
      error instanceof AnalysisError
        ? error.message
        : error instanceof OpenAI.APIConnectionError
          ? "The OpenAI connection failed. Check outbound networking and retry manually."
          : error instanceof OpenAI.APIError
            ? `OpenAI rejected the request (HTTP ${error.status ?? "unknown"}). Check account access, quota, and model configuration.`
            : "Analysis failed or its evidence could not be verified. Review the source and processing configuration.";
    await query(
      "UPDATE document_analyses SET status='failed',error=$2 WHERE id=$1",
      [id, reason],
    );
    throw new AnalysisError(
      `${reason} The attempt is recorded; no automatic retry will spend more.`,
      502,
    );
  }
}
