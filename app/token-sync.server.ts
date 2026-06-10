import { getBackendBaseUrl, getBackendSecret } from "./backend-api.server";

type TokenSyncSession = {
  shop: string;
  accessToken?: string | null;
  scope?: string | null;
  isOnline?: boolean;
  expires?: Date | null;
  refreshToken?: string | null;
  refreshTokenExpires?: Date | null;
};

function toIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

export async function syncSessionToBackend(session: TokenSyncSession) {
  const baseUrl = getBackendBaseUrl();
  const secret = getBackendSecret();
  if (!baseUrl) return;

  if (!session.accessToken) {
    console.error(`Token sync skipped: missing access token for ${session.shop}`);
    return;
  }

  const url = `${baseUrl}/shop-token`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Token-Sync-Secret": secret } : {}),
      },
      body: JSON.stringify({
        shop: session.shop,
        accessToken: session.accessToken,
        scope: session.scope || null,
        isOnline: Boolean(session.isOnline),
        expires: toIso(session.expires),
        refreshToken: session.refreshToken || null,
        refreshTokenExpires: toIso(session.refreshTokenExpires),
      }),
    });

    if (!response.ok) {
      let bodySnippet = "";
      try {
        bodySnippet = (await response.text()).slice(0, 256);
      } catch {
        // ignore body read failures
      }
      console.error(
        `Token sync failed for ${session.shop}: HTTP ${response.status} body=${bodySnippet}`,
      );
      return;
    }

    console.log(`Token sync succeeded for ${session.shop}`);
  } catch (error) {
    console.error(`Token sync exception for ${session.shop}:`, error);
  }
}
