import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { upsertShopToken } from "../shopify-shop.server";

type ResolveTokenBody = {
  shop?: unknown;
};

const MYSHOPIFY_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function getResolverSecret() {
  return (
    process.env.INTERNAL_TOKEN_RESOLVE_SECRET ||
    process.env.TOKEN_RESOLVE_SECRET ||
    process.env.TOKEN_SYNC_SECRET ||
    ""
  );
}

function getProvidedSecret(request: Request) {
  const directHeader =
    request.headers.get("x-token-resolve-secret") ||
    request.headers.get("x-internal-api-secret");
  if (directHeader) return directHeader.trim();

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

function toMs(value?: Date | null) {
  return value ? value.getTime() : null;
}

async function parseBody(request: Request): Promise<ResolveTokenBody> {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return (await request.json()) as ResolveTokenBody;
    } catch {
      return {};
    }
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    return { shop: formData.get("shop") };
  }

  return {};
}

function normalizeShop(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!MYSHOPIFY_DOMAIN_REGEX.test(normalized)) return null;
  return normalized;
}

export const loader = async (_args: LoaderFunctionArgs) =>
  new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });

export const action = async ({ request }: ActionFunctionArgs) => {
  const expectedSecret = getResolverSecret();
  if (!expectedSecret) {
    return Response.json(
      {
        ok: false,
        error:
          "Token resolver is disabled. Set INTERNAL_TOKEN_RESOLVE_SECRET.",
      },
      { status: 503 },
    );
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || providedSecret !== expectedSecret) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await parseBody(request);
  const shop = normalizeShop(body.shop);
  if (!shop) {
    return Response.json(
      {
        ok: false,
        error: "Invalid shop. Expected format: your-store.myshopify.com",
      },
      { status: 400 },
    );
  }

  try {
    const { session } = await unauthenticated.admin(shop);
    if (!session.accessToken) {
      return Response.json(
        { ok: false, error: `No access token available for ${shop}` },
        { status: 404 },
      );
    }

    await upsertShopToken({
      shopDomain: session.shop,
      accessToken: session.accessToken,
      accessTokenExpiresAtMs: toMs(session.expires),
      refreshToken: session.refreshToken || null,
      refreshTokenExpiresAtMs: toMs(session.refreshTokenExpires),
      scopes: session.scope || null,
    });

    return Response.json({
      ok: true,
      shop: session.shop,
      accessToken: session.accessToken,
      scope: session.scope || null,
      accessTokenExpiresAtMs: toMs(session.expires),
      refreshTokenExpiresAtMs: toMs(session.refreshTokenExpires),
    });
  } catch (error) {
    console.error(`Token resolve failed for ${shop}:`, error);
    return Response.json(
      {
        ok: false,
        error: "Failed to resolve token",
      },
      { status: 500 },
    );
  }
};
