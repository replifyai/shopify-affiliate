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
  const syncUrl = process.env.TOKEN_SYNC_URL;
  if (!syncUrl) return;

  if (!session.accessToken) {
    console.error(`Token sync skipped: missing access token for ${session.shop}`);
    return;
  }

  try {
    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.TOKEN_SYNC_SECRET
          ? { "X-Token-Sync-Secret": process.env.TOKEN_SYNC_SECRET }
          : {}),
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
      console.error(
        `Token sync failed for ${session.shop}: HTTP ${response.status}`,
      );
      return;
    }

    console.log(`Token sync succeeded for ${session.shop}`);
  } catch (error) {
    console.error(`Token sync exception for ${session.shop}:`, error);
  }
}
