import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";
import { getApplications } from "../src/lib/data/repository";
import { closeDatabase, query } from "../src/lib/db";
import {
  extractDescriptionHousing,
  estimateHousingCost,
  exportHousingRecords,
} from "../src/lib/housing/service";
loadEnvConfig(process.cwd());
async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const limit = Number(value("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error("--limit must be between 1 and 200.");
  const concurrency = Number(value("concurrency") ?? 1);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3)
    throw new Error("--concurrency must be between 1 and 3.");
  const selected = (await getApplications())
    .filter((a) => !value("id") || a.id === value("id"))
    .slice(0, limit);
  if (!selected.length) throw new Error("No matching applications.");
  const maximum = selected.reduce(
    (sum, a) => sum + estimateHousingCost(a.description),
    0,
  );
  console.log(
    JSON.stringify({
      applications: selected.length,
      maximumEstimatedUsd: maximum,
      execute: args.includes("--run"),
    }),
  );
  if (!args.includes("--run")) {
    console.log(
      "Add --run to use the configured OpenAI account. Existing unchanged attempts are reused.",
    );
    return;
  }
  const priorIds = (
    await query<{ id: string }>("SELECT id FROM housing_extractions")
  ).rows.map((row) => row.id);
  let cost = 0,
    completed = 0,
    reused = 0,
    failed = 0;
  let next = 0,
    stopped = false;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (!stopped && next < selected.length) {
        const application = selected[next++];
        try {
          const result = await extractDescriptionHousing(application);
          if (result.reused) reused++;
          else {
            completed++;
            cost += result.record.estimatedCostUsd ?? 0;
          }
          console.log(
            JSON.stringify({
              reference: application.reference,
              status: result.record.status,
              reused: result.reused,
              proposedUnits: result.record.result?.proposedUnits?.value ?? null,
            }),
          );
        } catch (error) {
          failed++;
          console.error(
            JSON.stringify({
              reference: application.reference,
              error:
                error instanceof Error ? error.message : "Extraction failed",
            }),
          );
          if (
            error instanceof Error &&
            error.message.includes("spending limit")
          )
            stopped = true;
        }
      }
    }),
  );
  if (value("export"))
    await writeFile(
      value("export")!,
      JSON.stringify(await exportHousingRecords(), null, 2) + "\n",
    );
  const charged = (
    await query<{ cost: string | number | null; unknown: string | number }>(
      "SELECT SUM(estimated_cost_usd) AS cost,COUNT(*) FILTER(WHERE estimated_cost_usd IS NULL) AS unknown FROM housing_extractions WHERE NOT(id=ANY($1::text[]))",
      [priorIds],
    )
  ).rows[0];
  cost = Number(charged.cost ?? 0);
  console.log(
    JSON.stringify({
      completed,
      reused,
      failed,
      newEstimatedCostUsd: cost,
      attemptsWithUnknownCost: Number(charged.unknown),
    }),
  );
  if (failed) process.exitCode = 1;
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Housing extraction failed",
    );
    process.exitCode = 1;
  })
  .finally(closeDatabase);
