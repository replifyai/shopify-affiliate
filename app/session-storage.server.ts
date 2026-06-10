import { Session, type SessionParams } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { callBackend } from "./backend-api.server";
import { syncSessionToBackend } from "./token-sync.server";

type StoredSession = {
  [key: string]: unknown;
  expires?: string | null;
  refreshTokenExpires?: string | null;
};

type LoadResponse = {
  ok: boolean;
  session: { sessionData: StoredSession } | null;
};

type FindByShopResponse = {
  ok: boolean;
  sessions: Array<{ sessionData: StoredSession }>;
};

function serializeSession(session: Session): StoredSession {
  const data = session.toObject() as StoredSession;
  return {
    ...data,
    expires: session.expires ? session.expires.toISOString() : null,
    refreshTokenExpires: session.refreshTokenExpires
      ? session.refreshTokenExpires.toISOString()
      : null,
  };
}

function deserializeSession(data: StoredSession): Session {
  const params = {
    ...data,
    expires: data.expires ? new Date(data.expires) : undefined,
    refreshTokenExpires: data.refreshTokenExpires
      ? new Date(data.refreshTokenExpires)
      : undefined,
  } as unknown as SessionParams;
  return new Session(params);
}

export class RemoteSessionStorage implements SessionStorage {
  private async forwardRefreshedOfflineToken(session: Session) {
    if (session.isOnline || !session.accessToken) return;

    try {
      await syncSessionToBackend({
        shop: session.shop,
        accessToken: session.accessToken,
        scope: session.scope || null,
        isOnline: session.isOnline,
        expires: session.expires || null,
        refreshToken: session.refreshToken || null,
        refreshTokenExpires: session.refreshTokenExpires || null,
      });
    } catch (error) {
      console.error(
        `Failed to sync refreshed token payload for ${session.shop}:`,
        error,
      );
    }
  }

  async storeSession(session: Session): Promise<boolean> {
    const now = Date.now();

    try {
      await callBackend({
        path: "/sessions/store",
        body: {
          id: session.id,
          shop: session.shop,
          isOnline: session.isOnline,
          expiresAt: session.expires ? session.expires.toISOString() : null,
          sessionData: serializeSession(session),
          now,
        },
      });
    } catch (error) {
      console.error(
        `[session-storage] remote storeSession failed for ${session.shop} (id=${session.id}):`,
        error,
      );
      throw error;
    }

    console.log(
      `[session-storage] stored session for ${session.shop} (id=${session.id}, isOnline=${session.isOnline})`,
    );

    await this.forwardRefreshedOfflineToken(session);

    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    try {
      const result = await callBackend<LoadResponse>({
        path: "/sessions/load",
        body: { id },
      });
      if (!result.session?.sessionData) return undefined;
      return deserializeSession(result.session.sessionData);
    } catch (error) {
      console.error(`[session-storage] remote loadSession failed (id=${id}):`, error);
      throw error;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await callBackend({
        path: "/sessions/delete",
        body: { ids: [id] },
      });
      return true;
    } catch (error) {
      console.error(`[session-storage] remote deleteSession failed (id=${id}):`, error);
      throw error;
    }
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (!ids.length) return true;
    try {
      await callBackend({
        path: "/sessions/delete",
        body: { ids },
      });
      return true;
    } catch (error) {
      console.error(
        `[session-storage] remote deleteSessions failed (count=${ids.length}):`,
        error,
      );
      throw error;
    }
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const result = await callBackend<FindByShopResponse>({
        path: "/sessions/find-by-shop",
        body: { shop, limit: 25 },
      });
      return (result.sessions || []).map((row) => deserializeSession(row.sessionData));
    } catch (error) {
      console.error(
        `[session-storage] remote findSessionsByShop failed (shop=${shop}):`,
        error,
      );
      throw error;
    }
  }
}
