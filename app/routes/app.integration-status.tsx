import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { apiVersion } from "../shopify.server";
import { ensureWebPixelConnected } from "../pixels.server";

const INTEGRATION_STATUS_QUERY = `#graphql
  query IntegrationStatus {
    app {
      requestedAccessScopes {
        handle
      }
      installation {
        accessScopes {
          handle
        }
      }
    }
    webPixel {
      id
      settings
    }
    webhookSubscriptions(first: 50) {
      edges {
        node {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const pixelRepair = session.accessToken
    ? await ensureWebPixelConnected(
        { shop: session.shop, accessToken: session.accessToken },
        apiVersion,
      )
    : { status: "failed", errors: "Missing access token" };
  const response = await admin.graphql(INTEGRATION_STATUS_QUERY);
  const payload = (await response.json()) as {
    data?: {
      app?: {
        requestedAccessScopes?: Array<{ handle?: string }>;
        installation?: {
          accessScopes?: Array<{ handle?: string }>;
        };
      };
      webPixel?: unknown;
      webhookSubscriptions?: { edges?: unknown[] };
    };
    errors?: unknown;
  };

  return Response.json({
    shop: session.shop,
    scope: session.scope,
    requestedScopes:
      payload?.data?.app?.requestedAccessScopes?.map((s) => s.handle) || [],
    installedScopes:
      payload?.data?.app?.installation?.accessScopes?.map((s) => s.handle) || [],
    pixelRepair,
    webPixel: payload?.data?.webPixel || null,
    webhookSubscriptions: payload?.data?.webhookSubscriptions?.edges || [],
    errors: payload?.errors || null,
  });
};
