import { query, resolveShopTokenTable } from "./db.server";

type UpsertShopTokenInput = {
  shopDomain: string;
  accessToken: string;
  scopes?: string | null;
  host?: string | null;
  embedded?: string | null;
  locale?: string | null;
  associatedUserScope?: string | null;
  callbackTimestamp?: string | null;
};

function nowMs() {
  return Date.now();
}

async function requireShopTable() {
  const table = await resolveShopTokenTable();
  if (!table) {
    throw new Error(
      "No shop token table found. Create public.shopity_shop or public.shopify_shop, or set SHOP_TOKEN_TABLE.",
    );
  }
  return table;
}

export async function upsertShopToken(input: UpsertShopTokenInput) {
  const shopTable = await requireShopTable();
  const timestampMs = nowMs();
  const callbackTimestamp =
    input.callbackTimestamp || new Date(timestampMs).toISOString();

  await query(
    `
      INSERT INTO ${shopTable} (
        shop_domain,
        access_token,
        scopes,
        first_installed_at,
        installed_at,
        uninstalled_at,
        updated_at,
        last_auth_at,
        last_callback_timestamp,
        host,
        embedded,
        locale,
        associated_user_scope
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (shop_domain) DO UPDATE
      SET
        access_token = EXCLUDED.access_token,
        scopes = EXCLUDED.scopes,
        installed_at = EXCLUDED.installed_at,
        uninstalled_at = NULL,
        updated_at = EXCLUDED.updated_at,
        last_auth_at = EXCLUDED.last_auth_at,
        last_callback_timestamp = EXCLUDED.last_callback_timestamp,
        host = COALESCE(EXCLUDED.host, ${shopTable}.host),
        embedded = COALESCE(EXCLUDED.embedded, ${shopTable}.embedded),
        locale = COALESCE(EXCLUDED.locale, ${shopTable}.locale),
        associated_user_scope = COALESCE(EXCLUDED.associated_user_scope, ${shopTable}.associated_user_scope),
        first_installed_at = COALESCE(${shopTable}.first_installed_at, EXCLUDED.first_installed_at)
    `,
    [
      input.shopDomain,
      input.accessToken,
      input.scopes || null,
      timestampMs,
      timestampMs,
      null,
      timestampMs,
      timestampMs,
      callbackTimestamp,
      input.host || null,
      input.embedded || null,
      input.locale || null,
      input.associatedUserScope || null,
    ],
  );
}

export async function updateShopScopes(shopDomain: string, scopes: string | null) {
  const shopTable = await requireShopTable();
  const timestampMs = nowMs();
  await query(
    `
      UPDATE ${shopTable}
      SET
        scopes = $2,
        updated_at = $3
      WHERE shop_domain = $1
    `,
    [shopDomain, scopes, timestampMs],
  );
}

export async function markShopUninstalled(shopDomain: string) {
  const shopTable = await requireShopTable();
  const timestampMs = nowMs();
  await query(
    `
      UPDATE ${shopTable}
      SET
        uninstalled_at = $2,
        updated_at = $3
      WHERE shop_domain = $1
    `,
    [shopDomain, timestampMs, timestampMs],
  );
}

export async function getShopAccessToken(shopDomain: string) {
  const shopTable = await requireShopTable();
  const result = await query<{ access_token: string | null }>(
    `
      SELECT access_token
      FROM ${shopTable}
      WHERE shop_domain = $1
        AND (uninstalled_at IS NULL OR uninstalled_at = 0)
      LIMIT 1
    `,
    [shopDomain],
  );
  return result.rows[0]?.access_token || null;
}
