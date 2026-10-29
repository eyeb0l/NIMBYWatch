import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizeCamden } from "../src/lib/data/camden";
import {
  resolveHousing,
  descriptionHash,
  type HousingCandidate,
} from "../src/lib/housing/resolve";
import {
  validateDescriptionHousing,
  extractDescriptionHousing,
  hydrateHousing,
  estimateHousingCost,
  type HousingProvider,
} from "../src/lib/housing/service";
import { closeDatabase, query } from "../src/lib/db";
import { upsertApplications } from "../src/lib/data/repository";
import type { HousingExtraction } from "../src/lib/analysis/schema";
const empty: HousingExtraction = {
  proposedUnits: null,
  netAdditionalUnits: null,
  approvedUnits: null,
  affordableUnits: null,
};
const description =
  "Synthetic test fixture. Change of use of commercial premises to 1 x self-contained residential dwelling (Class C3).";
const app = normalizeCamden(
  {
    application_number: "2099/0999/P",
    development_description: description,
    development_address: "Synthetic test site",
    decision_type: "Granted",
  },
  "2026-10-29T00:00:00Z",
)!;
const count = {
  value: 1,
  quote: "1 x self-contained residential dwelling (Class C3)",
  page: null,
  confidence: "high" as const,
};
const metrics = { ...empty, proposedUnits: count };
const candidate: HousingCandidate = {
  metrics,
  sourceUrl: "https://example.org/synthetic-fixture",
  sourceTitle: "Synthetic fixture",
  model: "test-model",
  promptVersion: "test-prompt",
  extractedAt: "2026-10-29T00:00:00Z",
  reviewed: false,
};
test("housing resolves per field without overwriting source fields or inferring approval", () => {
  const resolved = resolveHousing(app, [candidate]);
  assert.equal(resolved.proposedUnits.value, 1);
  assert.equal(resolved.proposedUnits.provenance, "ai_extracted");
  assert.equal(resolved.proposedUnits.evidence[0].quote, count.quote);
  assert.equal(resolved.approvedUnits.value, null);
  assert.equal(resolved.netAdditionalUnits.value, null);
  assert.equal(resolved.affordableUnits.value, null);
  assert.equal(app.proposedUnits, null);
  const structured = resolveHousing({ ...app, proposedUnits: 0 }, [candidate]);
  assert.equal(structured.proposedUnits.value, 0);
  assert.equal(structured.proposedUnits.provenance, "source_reported");
});
test("conflicting explicit quantities stay unknown, agreeing evidence is not added, low-confidence ignored", () => {
  const conflict = resolveHousing(app, [
    candidate,
    {
      ...candidate,
      metrics: { ...empty, proposedUnits: { ...count, value: 2 } },
    },
  ]);
  assert.equal(conflict.proposedUnits.value, null);
  assert.match(conflict.proposedUnits.reason!, /Conflicting/);
  assert.equal(
    resolveHousing(app, [candidate, candidate]).proposedUnits.value,
    1,
  );
  assert.equal(
    resolveHousing(app, [
      {
        ...candidate,
        metrics: { ...empty, proposedUnits: { ...count, confidence: "low" } },
      },
    ]).proposedUnits.value,
    null,
  );
});
test("source gate keeps exact current proposal and suppresses alteration, historic and wrong conversion quantities", () => {
  assert.equal(
    validateDescriptionHousing(metrics, app).proposedUnits?.value,
    1,
  );
  const existing = "External alterations to 4 existing flats.";
  assert.equal(
    validateDescriptionHousing(
      {
        ...empty,
        proposedUnits: { ...count, value: 4, quote: "4 existing flats" },
      },
      { ...app, description: existing },
    ).proposedUnits,
    null,
  );
  const stairs = "Construction of new stairs to 4 existing flats.";
  assert.equal(
    validateDescriptionHousing(
      { ...empty, proposedUnits: { ...count, value: 4, quote: stairs } },
      { ...app, description: stairs },
    ).proposedUnits,
    null,
  );
  const historical =
    "Variation of condition relating to construction of 4 flats.";
  assert.equal(
    validateDescriptionHousing(
      {
        ...empty,
        proposedUnits: { ...count, value: 4, quote: "construction of 4 flats" },
      },
      { ...app, description: historical },
    ).proposedUnits,
    null,
  );
  const conversion = "Conversion from 4 existing flats into 1 dwelling.";
  assert.equal(
    validateDescriptionHousing(
      { ...empty, proposedUnits: { ...count, value: 4, quote: conversion } },
      { ...app, description: conversion },
    ).proposedUnits,
    null,
  );
  assert.equal(
    validateDescriptionHousing(
      { ...empty, proposedUnits: { ...count, value: 1, quote: conversion } },
      { ...app, description: conversion },
    ).proposedUnits?.value,
    1,
  );
  assert.throws(
    () =>
      validateDescriptionHousing(
        {
          ...empty,
          proposedUnits: {
            ...count,
            value: 4,
            quote: "Construction of up to 4 flats.",
          },
        },
        { ...app, description: "Construction of up to 4 flats." },
      ),
    /exact/,
  );
});
test("description identity includes source content and URL, not timestamps", () => {
  assert.notEqual(
    descriptionHash(app),
    descriptionHash({ ...app, description: app.description + " Revised." }),
  );
  assert.notEqual(
    descriptionHash(app),
    descriptionHash({ ...app, sourceUrl: "https://example.org/new" }),
  );
  assert.equal(
    descriptionHash(app),
    descriptionHash(
      Object.assign({}, app, { ingestedAt: "2026-10-30T00:00:00Z" }),
    ),
  );
});
test("description extraction deduplicates, budgets, hides stale evidence and resolves only published document quantities", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nimby-housing-test-"));
  const saved = {
    url: process.env.DATABASE_URL,
    dir: process.env.PGLITE_DATA_DIR,
    limit: process.env.AI_DAILY_BUDGET_USD,
  };
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DATA_DIR = directory;
  process.env.AI_DAILY_BUDGET_USD = String(
    estimateHousingCost(description) + 0.000001,
  );
  try {
    await upsertApplications([app]);
    let calls = 0;
    const provider: HousingProvider = async () => {
      calls++;
      return { output: metrics, inputTokens: 100, outputTokens: 100 };
    };
    const [first, duplicate] = await Promise.all([
      extractDescriptionHousing(app, provider),
      extractDescriptionHousing(app, provider),
    ]);
    assert.equal(calls, 1);
    assert.equal(first.record.id, duplicate.record.id);
    assert.equal((await extractDescriptionHousing(app, provider)).reused, true);
    assert.equal(calls, 1);
    assert.equal(
      (await hydrateHousing([app]))[0].housing?.proposedUnits.value,
      1,
    );
    const documentMetrics = {
      ...empty,
      proposedUnits: {
        ...count,
        value: 2,
        quote: "Construction of 2 new homes.",
      },
    };
    await query(
      `INSERT INTO document_analyses(id,application_id,document_hash,model,prompt_version,status,metadata,source_text,result,reserved_cost_usd) VALUES($1,$2,'test-hash','test-model','test-prompt','needs_review',$3::jsonb,'Construction of 2 new homes.',$4::jsonb,0)`,
      [
        "test-document",
        app.id,
        JSON.stringify({
          title: "Synthetic officer report",
          sourceUrl: "https://example.org/test",
          documentType: "officer_report",
        }),
        JSON.stringify({ housing: documentMetrics }),
      ],
    );
    assert.equal(
      (await hydrateHousing([app]))[0].housing?.proposedUnits.value,
      1,
      "private draft cannot change public totals",
    );
    await query(
      "UPDATE document_analyses SET status='published' WHERE id='test-document'",
    );
    assert.equal(
      (await hydrateHousing([app]))[0].housing?.proposedUnits.value,
      null,
      "conflicting published evidence is unknown",
    );
    await query(
      "UPDATE document_analyses SET status='needs_review' WHERE id='test-document'",
    );
    await query(
      "UPDATE document_analyses SET status='published',metadata=$1::jsonb,source_text=$2,result=$3::jsonb WHERE id='test-document'",
      [
        JSON.stringify({
          title: "Synthetic application description",
          sourceUrl: "https://example.org/test",
          documentType: "application_description",
        }),
        description,
        JSON.stringify({ housing: metrics }),
      ],
    );
    assert.equal(
      (await hydrateHousing([app]))[0].housing?.proposedUnits.value,
      1,
    );
    const changed = { ...app, description: description + " Source revision." };
    await upsertApplications([changed]);
    assert.equal(
      (await hydrateHousing([changed]))[0].housing?.proposedUnits.value,
      null,
      "stale extraction never carries forward",
    );
    await assert.rejects(
      extractDescriptionHousing(changed, provider),
      /Daily analysis spending limit/,
    );
    assert.equal(calls, 1);
  } finally {
    await closeDatabase();
    for (const [name, value] of [
      ["DATABASE_URL", saved.url],
      ["PGLITE_DATA_DIR", saved.dir],
      ["AI_DAILY_BUDGET_USD", saved.limit],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
