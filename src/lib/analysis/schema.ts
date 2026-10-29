import { z } from "zod";

export const objectionCategories = [
  "traffic",
  "parking",
  "heritage",
  "overshadowing",
  "privacy",
  "neighbourhood_character",
  "ecology",
  "infrastructure",
  "other",
] as const;
export const documentTypes = [
  "officer_report",
  "decision_notice",
  "representation",
  "application_description",
] as const;
export const citationSchema = z
  .object({
    quote: z.string().min(8).max(1500),
    page: z.number().int().positive().nullable(),
  })
  .strict();
export const claimSchema = z
  .object({
    text: z.string().min(1).max(2500),
    confidence: z.enum(["high", "medium", "low"]),
    citations: z.array(citationSchema).min(1).max(8),
  })
  .strict();
// Housing is independent of narrative claims: each quantity has its own source passage.
export const extractedHousingCountSchema = z
  .object({
    value: z.number().int(),
    quote: z.string().min(8).max(1500),
    page: z.number().int().positive().nullable(),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .strict();
export const housingExtractionSchema = z
  .object({
    proposedUnits: extractedHousingCountSchema
      .extend({ value: z.number().int().nonnegative() })
      .nullable(),
    netAdditionalUnits: extractedHousingCountSchema.nullable(),
    approvedUnits: extractedHousingCountSchema
      .extend({ value: z.number().int().nonnegative() })
      .nullable(),
    affordableUnits: extractedHousingCountSchema
      .extend({ value: z.number().int().nonnegative() })
      .nullable(),
  })
  .strict();
export type ExtractedHousingCount = z.infer<typeof extractedHousingCountSchema>;
export type HousingExtraction = z.infer<typeof housingExtractionSchema>;

export const analysisSchema = z
  .object({
    summary: claimSchema.nullable(),
    housing: housingExtractionSchema.optional(),
    objections: z
      .array(
        z
          .object({ category: z.enum(objectionCategories), claim: claimSchema })
          .strict(),
      )
      .max(40),
    representationCount: z
      .object({
        value: z.number().int().nonnegative(),
        kind: z.enum(["objections", "representations"]),
        citation: citationSchema,
        confidence: z.enum(["high", "medium", "low"]),
      })
      .strict()
      .nullable(),
    officerAssessment: z.array(claimSchema).max(30),
    officerRecommendation: claimSchema.nullable(),
    refusalReasons: z.array(claimSchema).max(30),
    approvalConditions: z.array(claimSchema).max(50),
    limitations: z.array(z.string().min(1).max(500)).max(20),
  })
  .strict();
// Strict provider outputs always include all four quantities. Legacy drafts may omit housing.
export const analysisOutputSchema = analysisSchema.extend({
  housing: housingExtractionSchema,
});
export type AnalysisResult = z.infer<typeof analysisSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Citation = z.infer<typeof citationSchema>;
export const submissionSchema = z
  .object({
    applicationId: z.string().min(1).max(100),
    documentType: z.enum(documentTypes),
    title: z.string().trim().min(3).max(250),
    sourceUrl: z
      .string()
      .url()
      .max(2000)
      .refine(
        (value) => ["https:", "http:"].includes(new URL(value).protocol),
        "Use an HTTP(S) source URL",
      ),
    text: z.string().trim().min(40).max(60000),
    authorized: z.literal(true),
  })
  .strict();
export type Submission = z.infer<typeof submissionSchema>;

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();
const smallNumbers = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
function numberWords(value: number): string | null {
  if (value < 20) return smallNumbers[value] ?? null;
  if (value < 100) {
    const tens = [
      "",
      "",
      "twenty",
      "thirty",
      "forty",
      "fifty",
      "sixty",
      "seventy",
      "eighty",
      "ninety",
    ];
    return (
      tens[Math.floor(value / 10)] +
      (value % 10 ? "[ -]+" + smallNumbers[value % 10] : "")
    );
  }
  return null;
}
function quantityPattern(value: number): string {
  const magnitude = Math.abs(value);
  const digits = String(magnitude).replace(/\B(?=(\d{3})+(?!\d))/g, ",?");
  const words = numberWords(magnitude);
  const number = `(?:${digits}${words ? "|" + words : ""}${magnitude === 1 ? "|single" : ""})`;
  return number;
}
function explicitlyMentionsQuantity(quote: string, value: number): boolean {
  const number = quantityPattern(value);
  // The quantity must describe homes, not a year, site address, bedroom count or floors.
  const unit =
    "(?:homes?|dwelling(?:[ -]?house)?s?|flats?|apartments?|maisonettes?|residential units?|housing units?)";
  const modifiers =
    "(?:(?:new|additional|proposed|affordable|residential|self[ -]contained|semi[ -]detached|detached|family|studio|replacement|market|social|rented|private|existing|net|total|one[ -]bedroom|two[ -]bedroom|three[ -]bedroom|\\d+[ -]bed(?:room)?)[ -]+){0,6}";
  const before = new RegExp(
    `(?:^|[^\\w,.])${number}\\s*(?:(?:x|nos?\\.?)\\s*)?${modifiers}${unit}\\b`,
    "i",
  );
  const after = new RegExp(
    `\\b${unit}\\s*(?:[:=]|(?:will be|are|is|of|totals?)\\s+)\\s*${number}(?![\\w,.])`,
    "i",
  );
  if (before.test(quote) || after.test(quote)) return true;
  // A/an explicitly quantifies a singular residential unit, never a plural total or bedroom number.
  if (
    value === 1 &&
    new RegExp(
      `\\b(?:a|an)\\s+${modifiers}(?:home|dwelling(?:[ -]?house)?|flat|apartment|maisonette|residential unit|housing unit)\\b`,
      "i",
    ).test(quote)
  )
    return true;
  return (
    value === 0 &&
    /\b(?:no|zero) (?:new |additional |affordable |residential )?(?:homes?|dwellings?|flats?|housing units?)\b/i.test(
      quote,
    )
  );
}

function measureMatchesQuantity(
  field: string,
  quote: string,
  value: number,
): boolean {
  const number = quantityPattern(value);
  if (field === "affordableUnits") {
    if (
      value === 0 &&
      /\bno affordable (?:homes?|dwellings?|flats?|units?|housing)\b/i.test(
        quote,
      )
    )
      return true;
    return new RegExp(
      `(?:^|[^\\w,.])${number}\\s*(?:(?:x|nos?\\.?)\\s*)?(?:(?:new|proposed)\\s+)?affordable\\s+(?:homes?|dwellings?|flats?|apartments?|(?:residential )?units?)\\b|\\baffordable (?:homes?|dwellings?|flats?|units?)\\s*(?:[:=]|(?:will be|are|is|of|totals?)\\s+)\\s*${number}(?![\\w,.])`,
      "i",
    ).test(quote);
  }
  if (field === "netAdditionalUnits") {
    return new RegExp(
      `\\bnet\\s+(?:(?:additional|gain|increase|loss|reduction|decrease|change|addition|of)\\s+){0,4}[-−+]?\\s*${number}(?![\\w,.])|\\bnet (?:additional )?(?:homes?|dwellings?|flats?|units?)\\s*[:=]\\s*[-−+]?\\s*${number}(?![\\w,.])`,
      "i",
    ).test(quote);
  }
  return true;
}

/** Shared guard for description-only quantities and authorised document quantities.
 * It validates explicit numeric evidence; attribution and context still require editorial review.
 */
export function validateHousingExtraction(
  input: unknown,
  text: string,
  documentType: Submission["documentType"],
): HousingExtraction {
  const housing = housingExtractionSchema.parse(input);
  const pages = text.split("\f");
  for (const [field, claim] of Object.entries(housing)) {
    if (!claim) continue;
    if (documentType === "representation")
      throw new Error(
        "Resident representations cannot establish housing quantities.",
      );
    if (
      claim.page !== null &&
      (pages.length === 1 || claim.page > pages.length)
    )
      throw new Error(
        "Housing citation page is not present in the supplied document.",
      );
    const passage = claim.page === null ? text : pages[claim.page - 1];
    if (!normalise(passage).includes(normalise(claim.quote)))
      throw new Error(
        "A housing quotation cannot be matched to the supplied source.",
      );
    if (
      /\b(?:up to|at least|at most|approximately|circa|around|about|between)\b|\b\d+\s*[–-]\s*\d+\s*(?:homes?|dwellings?|flats?|units?)\b/i.test(
        claim.quote,
      )
    )
      throw new Error(
        "Housing quantity must be exact, not a range or approximation.",
      );
    if (!explicitlyMentionsQuantity(claim.quote, claim.value))
      throw new Error(
        "Housing quantity is not explicitly reported with a residential unit in its quotation.",
      );
    if (!measureMatchesQuantity(field, claim.quote, claim.value))
      throw new Error(
        "Housing quantity must explicitly identify its measure in the same passage.",
      );
    if (field === "approvedUnits" && documentType !== "decision_notice")
      throw new Error("Approved housing requires an explicit decision notice.");
    if (
      field === "approvedUnits" &&
      !/\b(?:approved|granted|permission|consent|permitted)\b/i.test(
        claim.quote,
      )
    )
      throw new Error(
        "Approved housing must be explicitly identified in its quotation.",
      );
    if (field === "netAdditionalUnits" && !/\bnet\b/i.test(claim.quote))
      throw new Error(
        "Net additional housing requires an explicitly stated net figure; do not calculate it.",
      );
    if (
      field === "netAdditionalUnits" &&
      claim.value < 0 &&
      !/\b(?:loss|reduction|decrease)\b|[-−]\s*\d/i.test(claim.quote)
    )
      throw new Error(
        "Negative net housing requires an explicitly stated loss or signed figure.",
      );
    if (
      field === "netAdditionalUnits" &&
      claim.value > 0 &&
      /\bnet (?:loss|reduction|decrease)\b/i.test(claim.quote)
    )
      throw new Error(
        "A net housing loss cannot be reported as a positive gain.",
      );
    if (field === "affordableUnits" && !/\baffordable\b/i.test(claim.quote))
      throw new Error(
        "Affordable housing requires an explicitly identified affordable quantity.",
      );
  }
  return housing;
}

/** Form-feed page breaks must be supplied by the operator. No invented PDF pagination. */
export function validateGrounding(
  input: unknown,
  text: string,
  documentType: Submission["documentType"],
): AnalysisResult {
  const result = analysisSchema.parse(input);
  if (result.housing)
    validateHousingExtraction(result.housing, text, documentType);
  const pages = text.split("\f");
  const claims = [
    result.summary,
    ...result.objections.map((o) => o.claim),
    ...result.officerAssessment,
    result.officerRecommendation,
    ...result.refusalReasons,
    ...result.approvalConditions,
  ].filter((c): c is Claim => c !== null);
  const citations = [
    ...claims.flatMap((c) => c.citations),
    ...(result.representationCount
      ? [result.representationCount.citation]
      : []),
  ];
  for (const citation of citations) {
    if (
      citation.page !== null &&
      (pages.length === 1 || citation.page > pages.length)
    ) {
      throw new Error("Citation page is not present in the supplied document.");
    }
    const source = citation.page === null ? text : pages[citation.page - 1];
    if (!normalise(source).includes(normalise(citation.quote)))
      throw new Error("A quotation cannot be matched to the supplied source.");
  }
  if (
    documentType === "application_description" &&
    (result.objections.length ||
      result.representationCount ||
      result.officerAssessment.length ||
      result.officerRecommendation ||
      result.refusalReasons.length ||
      result.approvalConditions.length)
  ) {
    throw new Error(
      "An application description cannot establish objections, officer assessment or formal decisions.",
    );
  }
  if (
    documentType === "representation" &&
    (result.officerAssessment.length ||
      result.officerRecommendation ||
      result.refusalReasons.length ||
      result.approvalConditions.length)
  ) {
    throw new Error(
      "A resident representation cannot establish an officer assessment or formal decision.",
    );
  }
  if (
    documentType !== "decision_notice" &&
    (result.refusalReasons.length || result.approvalConditions.length)
  ) {
    throw new Error(
      "Formal decision reasons and conditions require a decision notice.",
    );
  }
  // Reject common direct identifiers; human privacy review is still mandatory (names cannot be reliably detected).
  if (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(JSON.stringify(result)) ||
    /(?:\+44\s?|\b0)(?:\d[\s()-]?){9,10}\b/.test(JSON.stringify(result))
  ) {
    throw new Error(
      "Analysis contains a possible personal contact detail. Redact the source before processing.",
    );
  }
  return result;
}
