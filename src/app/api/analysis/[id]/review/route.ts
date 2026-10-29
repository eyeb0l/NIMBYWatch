import { NextResponse } from "next/server";
import { z } from "zod";
import { BodyLimitError, readJsonBody } from "@/lib/analysis/http";
import { hasAdminAccess } from "@/lib/analysis/auth";
import { AnalysisError, reviewAnalysis } from "@/lib/analysis/service";
export const runtime = "nodejs";
const reviewSchema = z
  .object({
    privacyReviewed: z.literal(true),
    accuracyReviewed: z.literal(true),
    rightsConfirmed: z.literal(true),
  })
  .strict();
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const headers = { "Cache-Control": "no-store" };
  if (!hasAdminAccess(request))
    return NextResponse.json(
      { error: "Operator authentication required." },
      { status: 401, headers },
    );
  try {
    reviewSchema.parse(await readJsonBody(request, 4096));
    return NextResponse.json(
      { analysis: await reviewAnalysis((await context.params).id) },
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof BodyLimitError
            ? "Request too large."
            : error instanceof AnalysisError
              ? error.message
              : "Confirm accuracy, privacy and reuse rights before publication.",
      },
      {
        status:
          error instanceof BodyLimitError
            ? 413
            : error instanceof AnalysisError
              ? error.status
              : 400,
        headers,
      },
    );
  }
}
