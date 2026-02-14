import { unauthenticated } from "./shopify.server";
import { upsertShopToken } from "./shopify-shop.server";

type UnauthenticatedAdminContext = Awaited<
  ReturnType<(typeof unauthenticated)["admin"]>
>;

export type GatewayAdminContext = UnauthenticatedAdminContext["admin"];
export type GatewaySession = UnauthenticatedAdminContext["session"];

export type GatewayAuthResult =
  | {
      ok: true;
      shop: string;
      admin: GatewayAdminContext;
      session: GatewaySession;
    }
  | {
      ok: false;
      response: Response;
    };

const MYSHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function toMs(value?: Date | null) {
  return value ? value.getTime() : null;
}

function getGatewaySecret() {
  return (
    process.env.INTERNAL_GATEWAY_SECRET ||
    process.env.INTERNAL_TOKEN_RESOLVE_SECRET ||
    process.env.TOKEN_RESOLVE_SECRET ||
    process.env.TOKEN_SYNC_SECRET ||
    ""
  );
}

function getProvidedSecret(request: Request) {
  const directHeader =
    request.headers.get("x-internal-gateway-secret") ||
    request.headers.get("x-token-resolve-secret") ||
    request.headers.get("x-internal-api-secret");
  if (directHeader) return directHeader.trim();

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

function normalizeShop(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!MYSHOPIFY_DOMAIN_REGEX.test(normalized)) return null;
  return normalized;
}

export function methodNotAllowed(allowed: string[]) {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: allowed.join(", ") },
  });
}

export function resolveShopFromRequest(
  request: Request,
  bodyShop?: unknown,
) {
  const url = new URL(request.url);
  const candidate =
    bodyShop ||
    url.searchParams.get("shop") ||
    request.headers.get("x-shopify-shop-domain") ||
    request.headers.get("x-shop-domain");

  return normalizeShop(candidate);
}

function getAuthError(request: Request) {
  const expectedSecret = getGatewaySecret();
  if (!expectedSecret) {
    return Response.json(
      {
        ok: false,
        error:
          "Internal gateway is disabled. Set INTERNAL_GATEWAY_SECRET on the app service.",
      },
      { status: 503 },
    );
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return Response.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  return null;
}

export async function authenticateGatewayRequest(
  request: Request,
  options?: {
    shop?: unknown;
  },
): Promise<GatewayAuthResult> {
  const authError = getAuthError(request);
  if (authError) {
    return { ok: false, response: authError };
  }

  const shop = resolveShopFromRequest(request, options?.shop);
  if (!shop) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: "Missing or invalid shop. Expected: your-store.myshopify.com",
        },
        { status: 400 },
      ),
    };
  }

  try {
    const { admin, session } = await unauthenticated.admin(shop);

    if (!session?.accessToken) {
      return {
        ok: false,
        response: Response.json(
          {
            ok: false,
            error: `No valid offline session for ${shop}. Reinstall/re-auth app.`,
          },
          { status: 404 },
        ),
      };
    }

    await upsertShopToken({
      shopDomain: session.shop,
      accessToken: session.accessToken,
      accessTokenExpiresAtMs: toMs(session.expires),
      refreshToken: session.refreshToken || null,
      refreshTokenExpiresAtMs: toMs(session.refreshTokenExpires),
      scopes: session.scope || null,
      locale: session.onlineAccessInfo?.associated_user?.locale || null,
      associatedUserScope: session.onlineAccessInfo?.associated_user_scope || null,
    });

    return {
      ok: true,
      shop: session.shop,
      admin,
      session,
    };
  } catch (error) {
    console.error(`[internal-gateway] Auth failure for ${shop}:`, error);
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error: "Failed to authenticate internal gateway request",
        },
        { status: 500 },
      ),
    };
  }
}

export async function parseJsonBody(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
