import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { query } from "./db.server";

type StoredSession = {
  [key: string]: unknown;
  expires?: string | null;
  refreshTokenExpires?: string | null;
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
  };
  return new Session(params as any);
}

export class PostgresSessionStorage implements SessionStorage {
  constructor(private readonly bootstrapReady: Promise<void>) {}

  private async ready() {
    await this.bootstrapReady;
  }

  async storeSession(session: Session): Promise<boolean> {
    await this.ready();
    const now = Date.now();
    const expiresAt = session.expires ? session.expires.toISOString() : null;
    const sessionData = JSON.stringify(serializeSession(session));

    await query(
      `
        INSERT INTO public.shopify_app_session (
          id,
          shop,
          is_online,
          expires_at,
          session_data,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
        ON CONFLICT (id) DO UPDATE
        SET
          shop = EXCLUDED.shop,
          is_online = EXCLUDED.is_online,
          expires_at = EXCLUDED.expires_at,
          session_data = EXCLUDED.session_data,
          updated_at = EXCLUDED.updated_at
      `,
      [
        session.id,
        session.shop,
        session.isOnline,
        expiresAt,
        sessionData,
        now,
        now,
      ],
    );

    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    await this.ready();
    const result = await query<{ session_data: StoredSession }>(
      `
        SELECT session_data
        FROM public.shopify_app_session
        WHERE id = $1
        LIMIT 1
      `,
      [id],
    );

    const row = result.rows[0];
    if (!row?.session_data) return undefined;
    return deserializeSession(row.session_data);
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.ready();
    await query("DELETE FROM public.shopify_app_session WHERE id = $1", [id]);
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    await this.ready();
    if (!ids.length) return true;
    await query("DELETE FROM public.shopify_app_session WHERE id = ANY($1::text[])", [
      ids,
    ]);
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    await this.ready();
    const result = await query<{ session_data: StoredSession }>(
      `
        SELECT session_data
        FROM public.shopify_app_session
        WHERE shop = $1
        ORDER BY updated_at DESC
        LIMIT 25
      `,
      [shop],
    );

    return result.rows.map((row) => deserializeSession(row.session_data));
  }
}
