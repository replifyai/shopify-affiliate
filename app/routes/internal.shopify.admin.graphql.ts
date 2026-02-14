import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  authenticateGatewayRequest,
  methodNotAllowed,
  parseJsonBody,
} from "../internal-gateway.server";

type GraphqlBody = {
  shop?: unknown;
  query?: unknown;
  variables?: unknown;
};

export const loader = async (_args: LoaderFunctionArgs) =>
  methodNotAllowed(["POST"]);

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const body = (await parseJsonBody(request)) as GraphqlBody | null;
  if (!body) {
    return Response.json(
      {
        ok: false,
        error: "Invalid JSON body",
      },
      { status: 400 },
    );
  }

  const auth = await authenticateGatewayRequest(request, { shop: body.shop });
  if (!auth.ok) return auth.response;

  if (typeof body.query !== "string" || !body.query.trim()) {
    return Response.json(
      {
        ok: false,
        error: "Missing required field: query",
      },
      { status: 400 },
    );
  }

  const variables =
    body.variables && typeof body.variables === "object" ? body.variables : {};

  try {
    const response = await auth.admin.graphql(body.query, { variables });
    const payload = (await response.json()) as {
      data?: unknown;
      errors?: unknown[];
    };

    const hasErrors = Array.isArray(payload.errors) && payload.errors.length > 0;

    return Response.json(
      {
        ok: !hasErrors,
        shop: auth.shop,
        data: payload.data ?? null,
        errors: payload.errors ?? null,
      },
      { status: hasErrors ? 422 : 200 },
    );
  } catch (error) {
    console.error(
      `[internal-gateway] GraphQL proxy failed for ${auth.shop}:`,
      error,
    );
    return Response.json(
      {
        ok: false,
        error: "Admin GraphQL request failed",
      },
      { status: 500 },
    );
  }
};
