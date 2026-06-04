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
    max: process.env.NODE_ENV === "production" ? 2 : 10,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
  };

  if (shouldUseSsl) {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
}

const pool = (global.pgPoolGlobal ??= createPool());

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

async function ensureSessionTable() {
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
}

export const dbReady = ensureSessionTable().catch((error) => {
  // Log but don't rethrow — table already exists in production.
  // Rethrowing causes an unhandled rejection that kills the serverless process.
  console.error("Failed to initialize database session table:", error);
});

export default pool;
