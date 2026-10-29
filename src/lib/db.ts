import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type QueryResult<T> = { rows: T[]; rowCount: number };
export type Query = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  sql: string,
  params?: unknown[],
) => Promise<QueryResult<T>>;
type Database = {
  query: Query;
  transaction: <T>(fn: (q: Query) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};
const globalDb = globalThis as typeof globalThis & {
  nimbyDatabase?: Promise<Database>;
};

function pgQuery(client: Pool | PoolClient): Query {
  return async <T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) => {
    const result = await client.query<T>(sql, params);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  };
}

async function connect(): Promise<Database> {
  let database: Database;
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 10000,
    });
    database = {
      query: pgQuery(pool),
      transaction: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(pgQuery(client));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    if (process.env.VERCEL)
      throw new Error(
        "DATABASE_URL is required on Vercel. Local embedded storage is not durable there.",
      );
    const directory =
      process.env.PGLITE_DATA_DIR ||
      path.join(process.cwd(), ".data", "postgres");
    await mkdir(directory, { recursive: true });
    const local = new PGlite(directory);
    await local.waitReady;
    const wrap =
      (client: Pick<PGlite, "query">): Query =>
      async <T extends Record<string, unknown>>(
        sql: string,
        params: unknown[] = [],
      ) => {
        const result = await client.query<T>(sql, params);
        return {
          rows: result.rows,
          rowCount: result.affectedRows ?? result.rows.length,
        };
      };
    database = {
      query: wrap(local),
      transaction: (fn) => local.transaction((tx) => fn(wrap(tx))),
      close: () => local.close(),
    };
  }
  await database.transaction(async (q) => {
    if (process.env.DATABASE_URL)
      await q("SELECT pg_advisory_xact_lock(193700241)");
    await q(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = path.join(process.cwd(), "migrations");
    for (const file of (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (
        (await q("SELECT name FROM schema_migrations WHERE name = $1", [file]))
          .rows.length
      )
        continue;
      const sql = await readFile(path.join(directory, file), "utf8");
      // Migration files contain schema statements without procedural bodies.
      for (const statement of sql
        .replace(/^\s*--.*$/gm, "")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean))
        await q(statement);
      await q("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
    }
  });
  return database;
}

export function getDatabase(): Promise<Database> {
  globalDb.nimbyDatabase ??= connect().catch((error) => {
    delete globalDb.nimbyDatabase;
    throw error;
  });
  return globalDb.nimbyDatabase;
}
export const query: Query = async (sql, params = []) =>
  (await getDatabase()).query(sql, params);
export async function transaction<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  return (await getDatabase()).transaction(fn);
}
export async function closeDatabase(): Promise<void> {
  if (globalDb.nimbyDatabase) {
    await (await globalDb.nimbyDatabase).close();
    delete globalDb.nimbyDatabase;
  }
}
