import type { ActionFunctionArgs } from "react-router";
import {
  authenticateGatewayRequest,
  methodNotAllowed,
} from "../internal-gateway.server";

type ResolveTokenBody = {
  shop?: unknown;
};

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

export const loader = async () => methodNotAllowed(["POST"]);

export const action = async ({ request }: ActionFunctionArgs) => {
  const body = await parseBody(request);
  const auth = await authenticateGatewayRequest(request, { shop: body.shop });
  if (!auth.ok) return auth.response;

  return Response.json({
    ok: true,
    shop: auth.session.shop,
    accessToken: auth.session.accessToken,
    scope: auth.session.scope || null,
    accessTokenExpiresAtMs: toMs(auth.session.expires),
    refreshTokenExpiresAtMs: toMs(auth.session.refreshTokenExpires),
  });
};
