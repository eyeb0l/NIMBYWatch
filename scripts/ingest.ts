import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import {
  camdenUrl,
  normalizeCamden,
  type CamdenRow,
  CAMDEN_DATASET,
} from "../src/lib/data/camden";
import { upsertApplications } from "../src/lib/data/repository";
import { closeDatabase } from "../src/lib/db";
import type { Application } from "../src/lib/types";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const limit = Number(
    args.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 180,
  );
  if (!Number.isInteger(limit) || limit < 100 || limit > 200)
    throw new Error("--limit must be an integer from 100 to 200.");
  const snapshot = args.includes("--snapshot");
  const fetchedAt = new Date().toISOString();
  let applications: Application[];
  let sourceUrl: string;
  if (snapshot) {
    applications = JSON.parse(
      await readFile("data/camden-applications.json", "utf8"),
    ) as Application[];
    sourceUrl = CAMDEN_DATASET;
  } else {
    sourceUrl = camdenUrl(300);
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent": "NIMBYWatch/0.1 (public planning research)",
        ...(process.env.SOCRATA_APP_TOKEN
          ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN }
          : {}),
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(
        `Camden API HTTP ${response.status}. Retry later; do not circumvent rate limits.`,
      );
    const rows: unknown = await response.json();
    if (!Array.isArray(rows))
      throw new Error("Camden returned an unexpected schema.");
    const unique = new Map<string, Application>();
    for (const row of rows as CamdenRow[]) {
      const app = normalizeCamden(row, fetchedAt);
      if (app) unique.set(app.id, app);
    }
    applications = [...unique.values()].slice(0, limit);
    if (applications.length < 100)
      throw new Error(
        `Only ${applications.length} matching records found. Existing database retained.`,
      );
    await writeFile(
      "data/camden-applications.json",
      JSON.stringify(applications, null, 2) + "\n",
    );
    await writeFile(
      "data/ingestion-manifest.json",
      JSON.stringify(
        {
          fetchedAt,
          sourceUrl,
          datasetUrl: CAMDEN_DATASET,
          count: applications.length,
          sha256: createHash("sha256")
            .update(JSON.stringify(applications))
            .digest("hex"),
          licence: "Open Government Licence v3.0",
          attribution:
            "London Borough of Camden; Contains OS data © Crown copyright and database right 2026",
          selection:
            "Latest full planning / householder applications with residential description terms, excluding flat-roof-only matches. Bounded convenience sample, not all Camden applications.",
          fieldsExcluded: [
            "applicant_name",
            "case_officer",
            "comment",
            "contact details",
          ],
          housingCounts:
            "Unknown: source has no explicit unit columns. No numeric inference from descriptions.",
        },
        null,
        2,
      ) + "\n",
    );
  }
  try {
    console.log(
      JSON.stringify({
        imported: applications.length,
        changed: await upsertApplications(applications),
        sourceUrl,
        snapshot,
      }),
    );
  } finally {
    await closeDatabase();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
