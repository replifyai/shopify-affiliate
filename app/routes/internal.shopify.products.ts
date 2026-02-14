import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  authenticateGatewayRequest,
  methodNotAllowed,
  resolveShopFromRequest,
} from "../internal-gateway.server";

function parseFirst(value: string | null, fallback = 50) {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(250, Math.max(1, parsed));
}

const LIST_PRODUCTS_QUERY = `#graphql
  query InternalListProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        cursor
        node {
          id
          title
          handle
          status
          productType
          vendor
          totalInventory
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GET_PRODUCT_QUERY = `#graphql
  query InternalGetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      productType
      vendor
      totalInventory
      createdAt
      updatedAt
      variants(first: 50) {
        edges {
          node {
            id
            title
            sku
            price
            inventoryQuantity
            createdAt
            updatedAt
          }
        }
      }
    }
  }
`;

export const action = async (_args: ActionFunctionArgs) =>
  methodNotAllowed(["GET"]);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = resolveShopFromRequest(request);
  const auth = await authenticateGatewayRequest(request, { shop });
  if (!auth.ok) return auth.response;

  const productId = url.searchParams.get("id");

  try {
    if (productId) {
      const response = await auth.admin.graphql(GET_PRODUCT_QUERY, {
        variables: { id: productId },
      });
      const payload = (await response.json()) as {
        data?: { product?: unknown };
        errors?: unknown[];
      };
      const hasErrors =
        Array.isArray(payload.errors) && payload.errors.length > 0;

      return Response.json(
        {
          ok: !hasErrors,
          shop: auth.shop,
          product: payload.data?.product ?? null,
          errors: payload.errors ?? null,
        },
        { status: hasErrors ? 422 : 200 },
      );
    }

    const first = parseFirst(url.searchParams.get("first"));
    const after = url.searchParams.get("after");
    const query = url.searchParams.get("query");

    const variables: Record<string, unknown> = { first };
    if (after) variables.after = after;
    if (query) variables.query = query;

    const response = await auth.admin.graphql(LIST_PRODUCTS_QUERY, { variables });
    const payload = (await response.json()) as {
      data?: {
        products?: {
          edges?: Array<{ cursor: string; node: Record<string, unknown> }>;
          pageInfo?: unknown;
        };
      };
      errors?: unknown[];
    };
    const hasErrors = Array.isArray(payload.errors) && payload.errors.length > 0;

    return Response.json(
      {
        ok: !hasErrors,
        shop: auth.shop,
        products:
          payload.data?.products?.edges?.map((edge) => ({
            cursor: edge.cursor,
            ...edge.node,
          })) ?? [],
        pageInfo: payload.data?.products?.pageInfo ?? null,
        errors: payload.errors ?? null,
      },
      { status: hasErrors ? 422 : 200 },
    );
  } catch (error) {
    console.error(`[internal-gateway] Products query failed for ${auth.shop}:`, error);
    return Response.json(
      {
        ok: false,
        error: "Failed to query products",
      },
      { status: 500 },
    );
  }
};
