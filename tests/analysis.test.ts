import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  analysisSchema,
  analysisOutputSchema,
  validateHousingExtraction,
  type HousingExtraction,
  submissionSchema,
  validateGrounding,
  type AnalysisResult,
} from "../src/lib/analysis/schema";
import { readJsonBody, BodyLimitError } from "../src/lib/analysis/http";
import { hasAdminAccess } from "../src/lib/analysis/auth";
import {
  analyseDocument,
  documentHash,
  estimateUpperCost,
  getPublishedAnalyses,
  reviewAnalysis,
  type Provider,
} from "../src/lib/analysis/service";
import { closeDatabase, query } from "../src/lib/db";

const source =
  "Synthetic test only. Construction of four new homes. Three objections were received about parking. The officer recommends approval.";
const empty: AnalysisResult = {
  summary: null,
  objections: [],
  representationCount: null,
  officerAssessment: [],
  officerRecommendation: null,
  refusalReasons: [],
  approvalConditions: [],
  limitations: ["Synthetic test fixture."],
};
const summary = {
  text: "Four homes are proposed.",
  confidence: "high" as const,
  citations: [{ quote: "Construction of four new homes.", page: null }],
};
const submission = {
  applicationId: "test-application",
  documentType: "application_description" as const,
  title: "Synthetic test document",
  sourceUrl: "https://example.org/test-fixture",
  text: source,
  authorized: true as const,
};

test("all extracted claims require citations and unknown counts stay null", () => {
  assert.deepEqual(
    validateGrounding({ ...empty, summary }, source, "application_description")
      .representationCount,
    null,
  );
  assert.throws(() =>
    analysisSchema.parse({ ...empty, summary: { ...summary, citations: [] } }),
  );
  assert.throws(() =>
    analysisSchema.parse({
      ...empty,
      representationCount: {
        value: -1,
        kind: "objections",
        confidence: "high",
        citation: summary.citations[0],
      },
    }),
  );
});
test("fabricated quotes and guessed pages are rejected", () => {
  assert.throws(
    () =>
      validateGrounding(
        {
          ...empty,
          summary: {
            ...summary,
            citations: [{ quote: "There were fifty objections.", page: null }],
          },
        },
        source,
        "application_description",
      ),
    /quotation/,
  );
  assert.throws(
    () =>
      validateGrounding(
        {
          ...empty,
          summary: {
            ...summary,
            citations: [{ ...summary.citations[0], page: 1 }],
          },
        },
        source,
        "application_description",
      ),
    /page/,
  );
  const paged = `First page.\f${source}`;
  assert.doesNotThrow(() =>
    validateGrounding(
      {
        ...empty,
        summary: {
          ...summary,
          citations: [{ ...summary.citations[0], page: 2 }],
        },
      },
      paged,
      "application_description",
    ),
  );
  assert.throws(
    () =>
      validateGrounding(
        {
          ...empty,
          summary: {
            ...summary,
            citations: [{ ...summary.citations[0], page: 1 }],
          },
        },
        paged,
        "application_description",
      ),
    /quotation/,
  );
});
test("evidence types cannot turn resident views into formal reasons", () => {
  assert.throws(
    () =>
      validateGrounding(
        { ...empty, officerRecommendation: summary },
        source,
        "representation",
      ),
    /resident representation/,
  );
  assert.throws(
    () =>
      validateGrounding(
        { ...empty, refusalReasons: [summary] },
        source,
        "officer_report",
      ),
    /decision notice/,
  );
  assert.throws(
    () =>
      validateGrounding(
        { ...empty, objections: [{ category: "parking", claim: summary }] },
        source,
        "application_description",
      ),
    /application description/,
  );
});
test("possible contact information rejected and rights attestation required", () => {
  assert.throws(
    () =>
      validateGrounding(
        {
          ...empty,
          summary: { ...summary, text: "Contact person@example.org" },
        },
        source,
        "application_description",
      ),
    /personal contact/,
  );
  assert.throws(() =>
    submissionSchema.parse({ ...submission, authorized: false }),
  );
  assert.throws(() =>
    submissionSchema.parse({ ...submission, sourceUrl: "javascript:alert(1)" }),
  );
});
test("streamed request bodies are bounded without trusting Content-Length", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ text: "a".repeat(200) }),
  });
  await assert.rejects(readJsonBody(request, 100), BodyLimitError);
  assert.deepEqual(
    await readJsonBody(
      new Request("http://localhost", {
        method: "POST",
        body: '{\"authorized\":true}',
      }),
      100,
    ),
    { authorized: true },
  );
});
test("authentication fails closed and keys are never optional", () => {
  delete process.env.ADMIN_TOKEN;
  assert.equal(hasAdminAccess(new Request("http://localhost")), false);
  process.env.ADMIN_TOKEN = "synthetic-test-admin-token-at-least-24";
  assert.equal(
    hasAdminAccess(
      new Request("http://localhost", {
        headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
      }),
    ),
    true,
  );
  assert.equal(
    hasAdminAccess(
      new Request("http://localhost", {
        headers: { authorization: "Bearer wrong" },
      }),
    ),
    false,
  );
  delete process.env.ADMIN_TOKEN;
});
test("hash covers document provenance and conservative cost grows with text", () => {
  assert.equal(documentHash(submission), documentHash({ ...submission }));
  assert.notEqual(
    documentHash(submission),
    documentHash({ ...submission, documentType: "decision_notice" }),
  );
  assert.notEqual(
    documentHash(submission),
    documentHash({ ...submission, sourceUrl: "https://example.org/other" }),
  );
  assert.ok(estimateUpperCost(source) > 0);
  assert.ok(estimateUpperCost(source.repeat(2)) > estimateUpperCost(source));
  assert.ok(
    estimateUpperCost("\f".repeat(60000)) > 0.1,
    "page wrappers must count against the spending cap",
  );
});

let testDirectory: string;
after(async () => {
  await closeDatabase();
  if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
});
test("database deduplicates concurrent attempts, enforces budget, and publishes only after review", async () => {
  testDirectory = await mkdtemp(path.join(tmpdir(), "nimby-analysis-test-"));
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DATA_DIR = testDirectory;
  process.env.AI_DAILY_BUDGET_USD = "0.02";
  await query(
    "INSERT INTO applications(id,reference,authority,status,payload) VALUES('test-application','test','Camden','pending','{}'::jsonb)",
  );
  let calls = 0;
  const provider: Provider = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      output: { ...empty, summary },
      inputTokens: 100,
      outputTokens: 200,
    };
  };
  const responses = await Promise.all([
    analyseDocument(submission, provider),
    analyseDocument(submission, provider),
  ]);
  assert.equal(calls, 1);
  assert.equal(responses[0].analysis.id, responses[1].analysis.id);
  assert.equal((await getPublishedAnalyses()).length, 0);
  assert.equal((await analyseDocument(submission, provider)).reused, true);
  assert.equal(calls, 1);
  const published = await reviewAnalysis(responses[0].analysis.id);
  assert.equal(published.status, "published");
  assert.equal((await getPublishedAnalyses("test-application")).length, 1);
  await assert.rejects(
    analyseDocument(
      { ...submission, title: "Second synthetic test document" },
      provider,
    ),
    /Daily analysis spending limit/,
  );
  assert.equal(calls, 1);
  const persisted = await query(
    "SELECT estimated_cost_usd FROM document_analyses",
  );
  assert.ok(Number(persisted.rows[0].estimated_cost_usd) > 0);
});

const noHousing: HousingExtraction = {
  proposedUnits: null,
  netAdditionalUnits: null,
  approvedUnits: null,
  affordableUnits: null,
};
function housingClaim(
  value: number,
  quote: string,
  page: number | null = null,
) {
  return { value, quote, page, confidence: "high" as const };
}
test("legacy analysis remains readable but new provider outputs require housing", () => {
  assert.doesNotThrow(() => analysisSchema.parse(empty));
  assert.throws(() => analysisOutputSchema.parse(empty));
  assert.doesNotThrow(() =>
    analysisOutputSchema.parse({ ...empty, housing: noHousing }),
  );
});
test("explicit current proposal extracts one dwelling without filling other measures", () => {
  const quote =
    "Change of use of the ground floor commercial unit (Class E) to 1 x self-contained residential dwelling (Class C3).";
  const result = validateGrounding(
    {
      ...empty,
      housing: { ...noHousing, proposedUnits: housingClaim(1, quote) },
    },
    quote,
    "application_description",
  );
  assert.equal(result.housing?.proposedUnits?.value, 1);
  assert.equal(result.housing?.netAdditionalUnits, null);
  assert.equal(result.housing?.approvedUnits, null);
  assert.equal(result.housing?.affordableUnits, null);
  const noNotation = "Extension of lower ground to create 4no. flats.";
  assert.equal(
    validateHousingExtraction(
      { ...noHousing, proposedUnits: housingClaim(4, noNotation) },
      noNotation,
      "application_description",
    ).proposedUnits?.value,
    4,
  );
});
test("housing quotations must report the exact quantity with unit and measure", () => {
  const fabricated = "The scheme proposes four homes.";
  assert.throws(
    () =>
      validateHousingExtraction(
        { ...noHousing, proposedUnits: housingClaim(5, fabricated) },
        fabricated,
        "application_description",
      ),
    /explicitly reported/,
  );
  assert.throws(
    () =>
      validateHousingExtraction(
        { ...noHousing, proposedUnits: housingClaim(4, fabricated) },
        "The scheme proposes one home.",
        "application_description",
      ),
    /quotation/,
  );
  for (const quote of [
    "A 4 bedroom house is proposed.",
    "4 storeys with residential use above.",
    "A 4.1 dwelling development is proposed.",
  ]) {
    assert.throws(() =>
      validateHousingExtraction(
        { ...noHousing, proposedUnits: housingClaim(4, quote) },
        quote,
        "application_description",
      ),
    );
  }
  for (const quote of [
    "Up to 4 new homes are proposed.",
    "Approximately 4 flats are proposed.",
    "Construction of 2-4 homes.",
  ]) {
    assert.throws(
      () =>
        validateHousingExtraction(
          { ...noHousing, proposedUnits: housingClaim(4, quote) },
          quote,
          "application_description",
        ),
      /exact/,
    );
  }
  const mixed =
    "The proposal has 10 homes, of which 2 affordable homes are included, with a net gain of 3 homes.";
  assert.throws(
    () =>
      validateHousingExtraction(
        { ...noHousing, affordableUnits: housingClaim(10, mixed) },
        mixed,
        "officer_report",
      ),
    /measure/,
  );
  assert.throws(
    () =>
      validateHousingExtraction(
        { ...noHousing, netAdditionalUnits: housingClaim(10, mixed) },
        mixed,
        "officer_report",
      ),
    /measure/,
  );
  assert.equal(
    validateHousingExtraction(
      {
        ...noHousing,
        affordableUnits: housingClaim(2, mixed),
        netAdditionalUnits: housingClaim(3, mixed),
      },
      mixed,
      "officer_report",
    ).affordableUnits?.value,
    2,
  );
});
test("housing does not derive net, approval or affordable values from proposals", () => {
  const quote = "Construction of four new homes.";
  for (const field of [
    "netAdditionalUnits",
    "affordableUnits",
    "approvedUnits",
  ] as const) {
    assert.throws(() =>
      validateHousingExtraction(
        { ...noHousing, [field]: housingClaim(4, quote) },
        quote,
        "application_description",
      ),
    );
  }
  assert.throws(
    () =>
      validateHousingExtraction(
        { ...noHousing, proposedUnits: housingClaim(4, quote) },
        quote,
        "representation",
      ),
    /Resident representations/,
  );
  const loss = "The proposal results in a net loss of 2 homes.";
  assert.equal(
    validateHousingExtraction(
      { ...noHousing, netAdditionalUnits: housingClaim(-2, loss) },
      loss,
      "officer_report",
    ).netAdditionalUnits?.value,
    -2,
  );
  assert.throws(
    () =>
      validateHousingExtraction(
        { ...noHousing, netAdditionalUnits: housingClaim(2, loss) },
        loss,
        "officer_report",
      ),
    /positive gain/,
  );
  const affordable = "The proposal contains 0 affordable homes.";
  assert.equal(
    validateHousingExtraction(
      { ...noHousing, affordableUnits: housingClaim(0, affordable) },
      affordable,
      "officer_report",
    ).affordableUnits?.value,
    0,
  );
  const approved = "Planning permission is granted for four new homes.";
  assert.equal(
    validateHousingExtraction(
      { ...noHousing, approvedUnits: housingClaim(4, approved) },
      approved,
      "decision_notice",
    ).approvedUnits?.value,
    4,
  );
});
test("bedroom modifiers do not become the dwelling count", () => {
  const quote = "Creation of 2 x 1-bed flats.";
  assert.equal(
    validateHousingExtraction(
      { ...noHousing, proposedUnits: housingClaim(2, quote) },
      quote,
      "application_description",
    ).proposedUnits?.value,
    2,
  );
  assert.throws(() =>
    validateHousingExtraction(
      { ...noHousing, proposedUnits: housingClaim(1, quote) },
      quote,
      "application_description",
    ),
  );
});
test("housing page citations cannot invent pagination", () => {
  const quote = "The proposal includes 4 dwellings.";
  assert.throws(
    () =>
      validateHousingExtraction(
        { ...noHousing, proposedUnits: housingClaim(4, quote, 1) },
        quote,
        "officer_report",
      ),
    /page/,
  );
  assert.equal(
    validateHousingExtraction(
      { ...noHousing, proposedUnits: housingClaim(4, quote, 2) },
      `Cover page.\f${quote}`,
      "officer_report",
    ).proposedUnits?.page,
    2,
  );
});

test("explicit residential noun variants and singular articles preserve quantities", () => {
  for (const [value, quote] of [
    [1, "Conversion to a single dwellinghouse."],
    [2, "Construction of two new semi-detached dwellings."],
    [2, "Conversion to 2 self-contained maisonettes."],
    [1, "Conversion to a single residential dwelling."],
    [1, "Construction of a single family dwelling."],
    [1, "Conversion of the office to a new studio flat."],
    [1, "Construction of a one-bedroom dwelling house."],
  ] as const) {
    assert.equal(
      validateHousingExtraction(
        { ...noHousing, proposedUnits: housingClaim(value, quote) },
        quote,
        "application_description",
      ).proposedUnits?.value,
      value,
      quote,
    );
  }
  for (const quote of [
    "Construction of new studio flats.",
    "Construction of a pair of maisonettes.",
    "Creation of one-bedroom flats.",
    "Creation of 1-bedroom flats.",
  ]) {
    assert.throws(() =>
      validateHousingExtraction(
        { ...noHousing, proposedUnits: housingClaim(1, quote) },
        quote,
        "application_description",
      ),
    );
  }
});
