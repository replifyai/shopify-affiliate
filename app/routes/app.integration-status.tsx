import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { apiVersion } from "../shopify.server";
import { ensureWebPixelConnected } from "../pixels.server";

const CONFIG_BASED_WEBHOOKS = [
  { topic: "app/uninstalled", uri: "/webhooks/app/uninstalled" },
  { topic: "app/scopes_update", uri: "/webhooks/app/scopes_update" },
  {
    topic: "orders/create",
    uri: "https://asia-south1-touch-17fa9.cloudfunctions.net/shopifyOrderCreated",
  },
  {
    topic: "orders/paid",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "orders/updated",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "orders/cancelled",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "refunds/create",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "fulfillments/create",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "fulfillments/update",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
];

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

  return {
    shop: session.shop,
    scope: session.scope,
    requestedScopes:
      payload?.data?.app?.requestedAccessScopes?.map((s) => s.handle) || [],
    installedScopes:
      payload?.data?.app?.installation?.accessScopes?.map((s) => s.handle) || [],
    pixelRepair,
    webPixel: payload?.data?.webPixel || null,
    configuredWebhooks: CONFIG_BASED_WEBHOOKS,
    webhookSubscriptions: payload?.data?.webhookSubscriptions?.edges || [],
    errors: payload?.errors || null,
  };
};

export default function IntegrationStatus() {
  const data = useLoaderData<typeof loader>();

  return (
    <s-page heading="Integration Status">
      <s-section heading="Shop">
        <s-paragraph>{data.shop}</s-paragraph>
      </s-section>

      <s-section heading="Scopes">
        <s-paragraph>
          Requested: {data.requestedScopes.join(", ") || "(none)"}
        </s-paragraph>
        <s-paragraph>
          Installed: {data.installedScopes.join(", ") || "(none)"}
        </s-paragraph>
      </s-section>

      <s-section heading="Pixel">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <pre style={{ margin: 0 }}>
            <code>{JSON.stringify({ repair: data.pixelRepair, webPixel: data.webPixel }, null, 2)}</code>
          </pre>
        </s-box>
      </s-section>

      <s-section heading="Webhook Subscriptions">
        <s-paragraph>
          App-specific webhooks from <code>shopify.app.affiliate-saleshq.toml</code>{" "}
          are managed by Shopify and may not appear in the Admin API
          <code> webhookSubscriptions</code> list.
        </s-paragraph>
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <pre style={{ margin: 0 }}>
            <code>{JSON.stringify(data.configuredWebhooks, null, 2)}</code>
          </pre>
        </s-box>
      </s-section>

      <s-section heading="Admin API Webhook Subscriptions (Optional)">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <pre style={{ margin: 0 }}>
            <code>{JSON.stringify(data.webhookSubscriptions, null, 2)}</code>
          </pre>
        </s-box>
      </s-section>

      {data.errors ? (
        <s-section heading="GraphQL Errors">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ margin: 0 }}>
              <code>{JSON.stringify(data.errors, null, 2)}</code>
            </pre>
          </s-box>
        </s-section>
      ) : null}
    </s-page>
  );
}
