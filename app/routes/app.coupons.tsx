import type { LoaderFunctionArgs } from "react-router";
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
