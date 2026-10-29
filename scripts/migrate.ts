import { loadEnvConfig } from "@next/env";
import { closeDatabase, getDatabase } from "../src/lib/db";

loadEnvConfig(process.cwd());

async function main() {
  try {
    await getDatabase();
    console.log("Database migrations applied.");
  } finally {
    await closeDatabase();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
