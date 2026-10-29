import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, query } from "../src/lib/db";
import {
  getApplication,
  getApplications,
  upsertApplications,
} from "../src/lib/data/repository";
import { normalizeCamden } from "../src/lib/data/camden";

test("PostgreSQL migrations persist records and unchanged upserts preserve timestamps", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nimbywatch-data-test-"));
  const previousUrl = process.env.DATABASE_URL;
  const previousDir = process.env.PGLITE_DATA_DIR;
  delete process.env.DATABASE_URL;
  process.env.PGLITE_DATA_DIR = directory;
  try {
    const seed = await getApplications();
    assert.ok(
      seed.length >= 100,
      "empty database imports the real bundled snapshot",
    );
    assert.ok(seed.every((record) => record.authority === "Camden"));
    await query("DELETE FROM housing_extractions");
    await query("DELETE FROM applications");
    const app = normalizeCamden(
      {
        application_number: "2099/0001/P",
        application_type: "Full Planning Permission",
        development_description: "Two flats",
        development_address: "Test fixture site",
        decision_type: "Refused",
      },
      "2026-10-29T00:00:00Z",
    )!;
    assert.equal(await upsertApplications([app]), 1);
    assert.equal(
      await upsertApplications([
        { ...app, ingestedAt: "2026-10-30T00:00:00Z" },
      ]),
      0,
    );
    assert.equal(
      (await getApplication(app.id))?.ingestedAt,
      "2026-10-29T00:00:00Z",
    );
    assert.equal(
      await upsertApplications([{ ...app, status: "withdrawn" }]),
      1,
    );
    assert.equal((await getApplication(app.id))?.status, "withdrawn");
    await closeDatabase();
    assert.equal(
      Number(
        (
          await query<{ count: string | number }>(
            "SELECT count(*) AS count FROM applications",
          )
        ).rows[0].count,
      ),
      1,
    );
    assert.equal((await getApplication(app.id))?.proposedUnits, null);
  } finally {
    await closeDatabase();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousDir === undefined) delete process.env.PGLITE_DATA_DIR;
    else process.env.PGLITE_DATA_DIR = previousDir;
    await rm(directory, { recursive: true, force: true });
  }
});
