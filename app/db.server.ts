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

const DEFAULT_SHOP_TOKEN_TABLES = [
  "public.shopify_shop",
  "public.shopity_shop",
] as const;

let resolvedShopTokenTable: string | null | undefined;
const tableColumnsCache = new Map<string, Set<string>>();

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

function normalizeQualifiedTableName(value: string | undefined | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const qualified = trimmed.includes(".") ? trimmed : `public.${trimmed}`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(qualified)) {
    return null;
  }

  return qualified;
}

function splitQualifiedTableName(tableName: string) {
  const [schema, table] = tableName.split(".");
  if (!schema || !table) {
    throw new Error(`Invalid qualified table name: ${tableName}`);
  }
  return { schema, table };
}

async function tableExists(tableName: string) {
  const result = await query<{ regclass: string | null }>(
    "SELECT to_regclass($1) AS regclass",
    [tableName],
  );
  return Boolean(result.rows[0]?.regclass);
}

export async function resolveShopTokenTable(options?: { forceRefresh?: boolean }) {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && resolvedShopTokenTable !== undefined) {
    return resolvedShopTokenTable;
  }

  if (forceRefresh) {
    resolvedShopTokenTable = undefined;
  }

  const configuredTable = normalizeQualifiedTableName(
    process.env.SHOP_TOKEN_TABLE || process.env.SHOP_TABLE,
  );

  if (configuredTable) {
    if (await tableExists(configuredTable)) {
      resolvedShopTokenTable = configuredTable;
      return configuredTable;
    }
    console.warn(
      `Configured shop token table ${configuredTable} not found in DATABASE_URL.`,
    );
  }

  for (const candidate of DEFAULT_SHOP_TOKEN_TABLES) {
    if (await tableExists(candidate)) {
      resolvedShopTokenTable = candidate;
      if (candidate !== DEFAULT_SHOP_TOKEN_TABLES[0]) {
        console.warn(
          `Using fallback shop token table ${candidate}. Set SHOP_TOKEN_TABLE to pin this explicitly.`,
        );
      }
      return candidate;
    }
  }

  resolvedShopTokenTable = null;
  return null;
}

export async function getTableColumns(
  tableName: string,
  options?: { forceRefresh?: boolean },
) {
  const forceRefresh = options?.forceRefresh === true;
  if (!forceRefresh && tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName) as Set<string>;
  }

  const { schema, table } = splitQualifiedTableName(tableName);
  const result = await query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
    `,
    [schema, table],
  );

  const columns = new Set(
    result.rows.map((row) => row.column_name.toLowerCase()),
  );
  tableColumnsCache.set(tableName, columns);
  return columns;
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

  const resolvedTable = await resolveShopTokenTable({ forceRefresh: true });
  if (!resolvedTable) {
    console.warn(
      "No shop token table found. Create public.shopify_shop or public.shopity_shop, or set SHOP_TOKEN_TABLE.",
    );
  }
}

export const dbReady = ensureRuntimeTables().catch((error) => {
  console.error("Failed to initialize database runtime tables:", error);
  throw error;
});

export default pool;
