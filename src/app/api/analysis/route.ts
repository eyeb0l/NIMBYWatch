import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BodyLimitError, readJsonBody } from "@/lib/analysis/http";
import { hasAdminAccess } from "@/lib/analysis/auth";
import {
  analyseDocument,
  AnalysisError,
  getAnalysisDrafts,
} from "@/lib/analysis/service";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (!hasAdminAccess(request))
    return NextResponse.json(
      { error: "Operator authentication required." },
      { status: 401, headers },
    );
  try {
    return NextResponse.json(
      await analyseDocument(await readJsonBody(request, 150000)),
      { headers },
    );
  } catch (error) {
    const status =
      error instanceof BodyLimitError
        ? 413
        : error instanceof AnalysisError
          ? error.status
          : error instanceof ZodError || error instanceof SyntaxError
            ? 400
            : 500;
    const message =
      error instanceof BodyLimitError
        ? "Document too large."
        : error instanceof AnalysisError
          ? error.message
          : status === 400
            ? "Check the document fields, source URL, text length, and authorisation confirmation."
            : "Analysis storage is unavailable. Contact the operator.";
    return NextResponse.json({ error: message }, { status, headers });
  }
}
export async function GET(request: Request) {
  if (!hasAdminAccess(request))
    return NextResponse.json(
      { error: "Operator authentication required." },
      { status: 401, headers },
    );
  const applicationId = new URL(request.url).searchParams.get("applicationId");
  if (!applicationId || applicationId.length > 100)
    return NextResponse.json(
      { error: "An application ID is required." },
      { status: 400, headers },
    );
  try {
    return NextResponse.json(
      { analyses: await getAnalysisDrafts(applicationId) },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Analysis storage is unavailable." },
      { status: 503, headers },
    );
  }
}
