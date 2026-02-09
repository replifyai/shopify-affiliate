import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);

/**
 * GET /app/coupons
 *
 * Fetches discount codes from the store.
 *
 * Query params:
 *  - code   (optional) – fetch a single discount by its code
 *  - first  (optional) – number of results to return (default 50)
 *  - after  (optional) – cursor for pagination
 *  - query  (optional) – search/filter string (Shopify search syntax)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // ── Fetch a single discount by code ──
  if (code) {
    const response = await admin.graphql(
      `#graphql
        query GetDiscountByCode($code: String!) {
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
        }`,
      { variables: { code } },
    );

    const responseJson = await response.json();
    return json({ discount: responseJson.data?.codeDiscountNodeByCode });
  }

  // ── List all discount codes ──
  const first = parseInt(url.searchParams.get("first") || "50", 10);
  const after = url.searchParams.get("after") || null;
  const query = url.searchParams.get("query") || null;

  const variables: Record<string, unknown> = { first };
  if (after) variables.after = after;
  if (query) variables.query = query;

  const response = await admin.graphql(
    `#graphql
      query ListDiscountCodes($first: Int!, $after: String, $query: String) {
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
      }`,
    { variables },
  );

  const responseJson = await response.json();
  return json({
    discounts: responseJson.data?.codeDiscountNodes?.edges?.map(
      (edge: { cursor: string; node: Record<string, unknown> }) => ({
        cursor: edge.cursor,
        ...edge.node,
      }),
    ),
    pageInfo: responseJson.data?.codeDiscountNodes?.pageInfo,
  });
};

/**
 * POST /app/coupons
 *
 * Creates a new discount code (coupon).
 *
 * Request body (JSON):
 *  - title                (required) – Display name for the discount
 *  - code                 (required) – The coupon code customers enter
 *  - discountType         (optional) – "percentage" | "fixedAmount" (default: "percentage")
 *  - discountValue        (required) – Numeric value (e.g. 0.10 for 10%, or 5.00 for $5)
 *  - startsAt             (optional) – ISO 8601 datetime (defaults to now)
 *  - endsAt               (optional) – ISO 8601 datetime (null = no expiry)
 *  - usageLimit           (optional) – Max total uses (null = unlimited)
 *  - appliesOncePerCustomer (optional) – Boolean (default: true)
 *  - appliesToAllItems    (optional) – Boolean (default: true)
 *  - productIds           (optional) – Array of product GIDs to scope the discount to
 *  - collectionIds        (optional) – Array of collection GIDs to scope the discount to
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();

  const {
    title,
    code,
    discountType = "percentage",
    discountValue,
    startsAt = new Date().toISOString(),
    endsAt = null,
    usageLimit = null,
    appliesOncePerCustomer = true,
    appliesToAllItems = true,
    productIds = [],
    collectionIds = [],
  } = body;

  if (!title || !code || discountValue === undefined) {
    return json(
      { error: "Missing required fields: title, code, discountValue" },
      { status: 400 },
    );
  }

  // Build the discount value input
  const valueInput =
    discountType === "percentage"
      ? { percentage: discountValue }
      : { discountAmount: { amount: String(discountValue), appliesOnEachItem: false } };

  // Build the items input
  let itemsInput: Record<string, unknown> = { all: true };
  if (!appliesToAllItems) {
    if (productIds.length > 0) {
      itemsInput = { products: { productsToAdd: productIds } };
    } else if (collectionIds.length > 0) {
      itemsInput = { collections: { add: collectionIds } };
    }
  }

  const basicCodeDiscount = {
    title,
    code,
    startsAt,
    endsAt,
    usageLimit,
    appliesOncePerCustomer,
    customerGets: {
      value: valueInput,
      items: itemsInput,
    },
    context: {
      all: true,
    },
  };

  const response = await admin.graphql(
    `#graphql
      mutation CreateDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
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
      }`,
    { variables: { basicCodeDiscount } },
  );

  const responseJson = await response.json();
  const userErrors =
    responseJson.data?.discountCodeBasicCreate?.userErrors || [];

  if (userErrors.length > 0) {
    return json({ errors: userErrors }, { status: 422 });
  }

  return json({
    discount: responseJson.data?.discountCodeBasicCreate?.codeDiscountNode,
  });
};
