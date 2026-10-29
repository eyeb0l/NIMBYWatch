import { readFile } from "node:fs/promises";
import path from "node:path";
import { query, transaction } from "../db";
import type { Application } from "../types";
import {hydrateHousing,seedHousingSnapshot} from "../housing/service";

export async function upsertApplications(applications: Application[]): Promise<number> {
  return transaction(async (q) => {
    let changed = 0;
    for (const input of applications) {
      const {housing: _derivedHousing,...application}=input;
      const result = await q(`INSERT INTO applications (id, reference, authority, registered_date, status, payload)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (id) DO UPDATE SET registered_date = EXCLUDED.registered_date, status = EXCLUDED.status,
          payload = EXCLUDED.payload, updated_at = now()
        WHERE applications.payload - 'ingestedAt' IS DISTINCT FROM EXCLUDED.payload - 'ingestedAt'`,
      [application.id, application.reference, application.authority, application.registeredDate, application.status, JSON.stringify(application)]);
      changed += result.rowCount;
    }
    return changed;
  });
}

let seeding: Promise<void> | undefined;
export async function ensureSeed(): Promise<void> {
  seeding ??= (async () => {
    if (Number((await query<{ count: string | number }>("SELECT count(*) AS count FROM applications")).rows[0].count) !== 0) return;
    const applications = JSON.parse(await readFile(path.join(process.cwd(), "data", "camden-applications.json"), "utf8")) as Application[];
    await upsertApplications(applications);
  })().catch((error) => { seeding = undefined; throw error; });
  await seeding;
  await seedHousingSnapshot();
}
export async function getApplications(): Promise<Application[]> {
  await ensureSeed();
  return hydrateHousing((await query<{ payload: Application }>("SELECT payload FROM applications ORDER BY registered_date DESC NULLS LAST, reference ASC")).rows.map((row) => row.payload));
}
export async function getApplication(id: string): Promise<Application | null> {
  await ensureSeed();
  const application=(await query<{ payload: Application }>("SELECT payload FROM applications WHERE id = $1", [id])).rows[0]?.payload;
  return application?(await hydrateHousing([application]))[0]:null;
}
