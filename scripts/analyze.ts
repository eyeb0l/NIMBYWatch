import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
async function main() {
  const { analyseDocument } = await import("../src/lib/analysis/service");
  const { closeDatabase } = await import("../src/lib/db");
  try {
    const path = process.argv[2];
    if (!path)
      throw new Error(
        "Usage: npm run analyze -- /absolute/path/to/authorised-document.json",
      );
    const input = JSON.parse(await readFile(path, "utf8"));
    const { analysis, reused } = await analyseDocument(input);
    console.log(
      JSON.stringify(
        {
          id: analysis.id,
          status: analysis.status,
          model: analysis.model,
          estimatedCostUsd: analysis.estimatedCostUsd,
          reused,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Analysis failed.");
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
void main();
