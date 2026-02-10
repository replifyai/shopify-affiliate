import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var pgPoolGlobal: Pool | undefined;
}

function getDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl) return configuredUrl;

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production.");
  }

  console.warn(
    "DATABASE_URL is not set. Falling back to local PostgreSQL at localhost:5432 for development.",
  );
  return "postgresql://postgres:postgres@localhost:5432/postgres?schema=public";
}

const databaseUrl = getDatabaseUrl();
const shouldUseSsl =
  /sslmode=require/i.test(databaseUrl) || /\.neon\.tech\b/i.test(databaseUrl);

function createPool() {
  const config: PoolConfig = {
    connectionString: databaseUrl,
    max: process.env.NODE_ENV === "production" ? 20 : 10,
  };

  if (shouldUseSsl) {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
}

const pool =
  process.env.NODE_ENV === "production"
    ? createPool()
    : (global.pgPoolGlobal ??= createPool());

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

async function ensureRuntimeTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.shopify_app_session (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      is_online BOOLEAN NOT NULL DEFAULT false,
      expires_at TIMESTAMPTZ NULL,
      session_data JSONB NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS shopify_app_session_shop_idx
    ON public.shopify_app_session (shop)
  `);

  const tableCheck = await query<{ regclass: string | null }>(
    "SELECT to_regclass('public.shopity_shop') AS regclass",
  );
  if (!tableCheck.rows[0]?.regclass) {
    console.warn(
      "Table public.shopity_shop not found. Token upsert will fail until this table exists.",
    );
  }
}

export const dbReady = ensureRuntimeTables().catch((error) => {
  console.error("Failed to initialize database runtime tables:", error);
  throw error;
});

export default pool;
