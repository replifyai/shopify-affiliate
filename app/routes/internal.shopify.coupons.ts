import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  authenticateGatewayRequest,
  methodNotAllowed,
  parseJsonBody,
  resolveShopFromRequest,
} from "../internal-gateway.server";

function parseFirst(value: string | null, fallback = 50) {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(250, Math.max(1, parsed));
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function buildValueInput(
  discountType: string,
  discountValue: number | string,
): Record<string, unknown> {
  if (discountType === "percentage") {
    return { percentage: discountValue };
  }

  return {
    discountAmount: {
      amount: String(discountValue),
      appliesOnEachItem: false,
    },
  };
}

function buildItemsInput(input: {
  appliesToAllItems: boolean;
  productIds: string[];
  collectionIds: string[];
}) {
  const { appliesToAllItems, productIds, collectionIds } = input;
  if (appliesToAllItems) return { all: true };
  if (productIds.length > 0) {
    return { products: { productsToAdd: productIds } };
  }
  if (collectionIds.length > 0) {
    return { collections: { add: collectionIds } };
  }

  return { all: true };
}

const GET_DISCOUNT_BY_CODE_QUERY = `#graphql
  query InternalGetDiscountByCode($code: String!) {
    codeDiscountNodeByCode(code: $code) {
      id
      codeDiscount {
        ... on DiscountCodeBasic {
          title
          status
          startsAt
          endsAt
          asyncUsageCount
          usageLimit
          appliesOncePerCustomer
          codes(first: 5) {
            nodes {
              code
            }
          }
          customerGets {
            value {
              ... on DiscountPercentage {
                percentage
              }
              ... on DiscountAmount {
                amount {
                  amount
                  currencyCode
                }
              }
            }
            items {
              ... on AllDiscountItems {
                allItems
              }
            }
          }
          summary
        }
        ... on DiscountCodeFreeShipping {
          title
          status
          startsAt
          endsAt
          asyncUsageCount
          usageLimit
          codes(first: 5) {
            nodes {
              code
            }
          }
          summary
        }
      }
    }
  }
`;

const LIST_DISCOUNTS_QUERY = `#graphql
  query InternalListDiscountCodes($first: Int!, $after: String, $query: String) {
    codeDiscountNodes(first: $first, after: $after, query: $query) {
      edges {
        cursor
        node {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              status
              startsAt
              endsAt
              asyncUsageCount
              usageLimit
              codes(first: 5) {
                nodes {
                  code
                }
              }
              summary
            }
            ... on DiscountCodeFreeShipping {
              title
              status
              startsAt
              endsAt
              asyncUsageCount
              usageLimit
              codes(first: 5) {
                nodes {
                  code
                }
              }
              summary
            }
            ... on DiscountCodeBxgy {
              title
              status
              startsAt
              endsAt
              asyncUsageCount
              usageLimit
              codes(first: 5) {
                nodes {
                  code
                }
              }
              summary
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_DISCOUNT_MUTATION = `#graphql
  mutation InternalCreateDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            usageLimit
            appliesOncePerCustomer
            codes(first: 5) {
              nodes {
                code
              }
            }
            customerGets {
              value {
                ... on DiscountPercentage {
                  percentage
                }
                ... on DiscountAmount {
                  amount {
                    amount
                    currencyCode
                  }
                }
              }
            }
            summary
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_DISCOUNT_MUTATION = `#graphql
  mutation InternalUpdateDiscountCode(
    $id: ID!
    $basicCodeDiscount: DiscountCodeBasicInput!
  ) {
    discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            usageLimit
            appliesOncePerCustomer
            codes(first: 5) {
              nodes {
                code
              }
            }
            customerGets {
              value {
                ... on DiscountPercentage {
                  percentage
                }
                ... on DiscountAmount {
                  amount {
                    amount
                    currencyCode
                  }
                }
              }
            }
            summary
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = resolveShopFromRequest(request);
  const auth = await authenticateGatewayRequest(request, { shop });
  if (!auth.ok) return auth.response;

  const code = url.searchParams.get("code");

  try {
    if (code) {
      const response = await auth.admin.graphql(GET_DISCOUNT_BY_CODE_QUERY, {
        variables: { code },
      });
      const payload = (await response.json()) as {
        data?: { codeDiscountNodeByCode?: unknown };
        errors?: unknown[];
      };
      const hasErrors = Array.isArray(payload.errors) && payload.errors.length > 0;

      return Response.json(
        {
          ok: !hasErrors,
          shop: auth.shop,
          discount: payload.data?.codeDiscountNodeByCode ?? null,
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

    const response = await auth.admin.graphql(LIST_DISCOUNTS_QUERY, { variables });
    const payload = (await response.json()) as {
      data?: {
        codeDiscountNodes?: {
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
        discounts:
          payload.data?.codeDiscountNodes?.edges?.map((edge) => ({
            cursor: edge.cursor,
            ...edge.node,
          })) ?? [],
        pageInfo: payload.data?.codeDiscountNodes?.pageInfo ?? null,
        errors: payload.errors ?? null,
      },
      { status: hasErrors ? 422 : 200 },
    );
  } catch (error) {
    console.error(`[internal-gateway] Coupon query failed for ${auth.shop}:`, error);
    return Response.json(
      {
        ok: false,
        error: "Failed to query coupons",
      },
      { status: 500 },
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST" && request.method !== "PATCH") {
    return methodNotAllowed(["GET", "POST", "PATCH"]);
  }

  const body = await parseJsonBody(request);
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

  try {
    if (request.method === "POST") {
      const title = typeof body.title === "string" ? body.title : "";
      const code = typeof body.code === "string" ? body.code : "";
      const discountType =
        typeof body.discountType === "string" ? body.discountType : "percentage";
      const discountValue = body.discountValue;
      const startsAt =
        typeof body.startsAt === "string"
          ? body.startsAt
          : new Date().toISOString();
      const endsAt = hasOwn(body, "endsAt") ? body.endsAt : null;
      const usageLimit = hasOwn(body, "usageLimit") ? body.usageLimit : null;
      const appliesOncePerCustomer = hasOwn(body, "appliesOncePerCustomer")
        ? Boolean(body.appliesOncePerCustomer)
        : true;
      const appliesToAllItems = hasOwn(body, "appliesToAllItems")
        ? Boolean(body.appliesToAllItems)
        : true;
      const productIds = Array.isArray(body.productIds)
        ? body.productIds.filter((id): id is string => typeof id === "string")
        : [];
      const collectionIds = Array.isArray(body.collectionIds)
        ? body.collectionIds.filter((id): id is string => typeof id === "string")
        : [];

      if (!title || !code || discountValue === undefined) {
        return Response.json(
          {
            ok: false,
            error: "Missing required fields: title, code, discountValue",
          },
          { status: 400 },
        );
      }

      const basicCodeDiscount = {
        title,
        code,
        startsAt,
        endsAt,
        usageLimit,
        appliesOncePerCustomer,
        customerGets: {
          value: buildValueInput(
            discountType,
            discountValue as number | string,
          ),
          items: buildItemsInput({
            appliesToAllItems,
            productIds,
            collectionIds,
          }),
        },
        context: {
          all: true,
        },
      };

      const response = await auth.admin.graphql(CREATE_DISCOUNT_MUTATION, {
        variables: { basicCodeDiscount },
      });
      const payload = (await response.json()) as {
        data?: {
          discountCodeBasicCreate?: {
            codeDiscountNode?: unknown;
            userErrors?: Array<{ field?: string[]; message?: string }>;
          };
        };
        errors?: unknown[];
      };

      const graphqlErrors = payload.errors ?? [];
      const userErrors = payload.data?.discountCodeBasicCreate?.userErrors ?? [];

      if (graphqlErrors.length > 0 || userErrors.length > 0) {
        return Response.json(
          {
            ok: false,
            shop: auth.shop,
            errors: {
              graphql: graphqlErrors,
              user: userErrors,
            },
          },
          { status: 422 },
        );
      }

      return Response.json({
        ok: true,
        shop: auth.shop,
        discount: payload.data?.discountCodeBasicCreate?.codeDiscountNode ?? null,
      });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return Response.json(
        {
          ok: false,
          error: "Missing required field: id",
        },
        { status: 400 },
      );
    }

    const basicCodeDiscount: Record<string, unknown> = {};
    if (hasOwn(body, "title")) basicCodeDiscount.title = body.title;
    if (hasOwn(body, "code")) basicCodeDiscount.code = body.code;
    if (hasOwn(body, "startsAt")) basicCodeDiscount.startsAt = body.startsAt;
    if (hasOwn(body, "endsAt")) basicCodeDiscount.endsAt = body.endsAt;
    if (hasOwn(body, "usageLimit")) basicCodeDiscount.usageLimit = body.usageLimit;
    if (hasOwn(body, "appliesOncePerCustomer")) {
      basicCodeDiscount.appliesOncePerCustomer = Boolean(
        body.appliesOncePerCustomer,
      );
    }

    const hasDiscountType = hasOwn(body, "discountType");
    const hasDiscountValue = hasOwn(body, "discountValue");
    const hasItemScopeChanges =
      hasOwn(body, "appliesToAllItems") ||
      hasOwn(body, "productIds") ||
      hasOwn(body, "collectionIds");

    if (hasDiscountType !== hasDiscountValue) {
      return Response.json(
        {
          ok: false,
          error:
            "Provide both discountType and discountValue when updating discount value.",
        },
        { status: 400 },
      );
    }

    if (hasItemScopeChanges && !hasDiscountValue) {
      return Response.json(
        {
          ok: false,
          error:
            "When updating item applicability, provide discountType and discountValue as well.",
        },
        { status: 400 },
      );
    }

    if (hasDiscountType && hasDiscountValue) {
      const discountType =
        typeof body.discountType === "string" ? body.discountType : "percentage";
      const appliesToAllItems = hasOwn(body, "appliesToAllItems")
        ? Boolean(body.appliesToAllItems)
        : true;
      const productIds = Array.isArray(body.productIds)
        ? body.productIds.filter((entry): entry is string => typeof entry === "string")
        : [];
      const collectionIds = Array.isArray(body.collectionIds)
        ? body.collectionIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];

      basicCodeDiscount.customerGets = {
        value: buildValueInput(
          discountType,
          body.discountValue as number | string,
        ),
        items: buildItemsInput({
          appliesToAllItems,
          productIds,
          collectionIds,
        }),
      };
    }

    if (Object.keys(basicCodeDiscount).length === 0) {
      return Response.json(
        {
          ok: false,
          error: "No fields provided to update.",
        },
        { status: 400 },
      );
    }

    const response = await auth.admin.graphql(UPDATE_DISCOUNT_MUTATION, {
      variables: { id, basicCodeDiscount },
    });
    const payload = (await response.json()) as {
      data?: {
        discountCodeBasicUpdate?: {
          codeDiscountNode?: unknown;
          userErrors?: Array<{ field?: string[]; message?: string }>;
        };
      };
      errors?: unknown[];
    };

    const graphqlErrors = payload.errors ?? [];
    const userErrors = payload.data?.discountCodeBasicUpdate?.userErrors ?? [];

    if (graphqlErrors.length > 0 || userErrors.length > 0) {
      return Response.json(
        {
          ok: false,
          shop: auth.shop,
          errors: {
            graphql: graphqlErrors,
            user: userErrors,
          },
        },
        { status: 422 },
      );
    }

    return Response.json({
      ok: true,
      shop: auth.shop,
      discount: payload.data?.discountCodeBasicUpdate?.codeDiscountNode ?? null,
    });
  } catch (error) {
    console.error(`[internal-gateway] Coupon mutation failed for ${auth.shop}:`, error);
    return Response.json(
      {
        ok: false,
        error: "Failed to mutate coupon",
      },
      { status: 500 },
    );
  }
};
