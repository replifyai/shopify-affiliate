import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { apiVersion, authenticate } from "../shopify.server";
import { ensureWebPixelConnected } from "../pixels.server";

const LOCAL_WEBHOOKS = [
  { topic: "app/uninstalled", uri: "/webhooks/app/uninstalled" },
  { topic: "app/scopes_update", uri: "/webhooks/app/scopes_update" },
  { topic: "customers/data_request", uri: "/webhooks/gdpr" },
  { topic: "customers/redact", uri: "/webhooks/gdpr" },
  { topic: "shop/redact", uri: "/webhooks/gdpr" },
];

const DIRECT_WEBHOOKS = [
  "orders/create",
  "orders/paid",
  "orders/updated",
  "orders/cancelled",
  "refunds/create",
  "fulfillments/create",
  "fulfillments/update",
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

async function fetchIntegrationData(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  const response = await admin.graphql(INTEGRATION_STATUS_QUERY);
  const payload = (await response.json()) as {
    data?: {
      app?: {
        requestedAccessScopes?: Array<{ handle?: string }>;
        installation?: { accessScopes?: Array<{ handle?: string }> };
      };
      webPixel?: { id?: string; settings?: string } | null;
      webhookSubscriptions?: { edges?: unknown[] };
    };
    errors?: unknown;
  };

  return {
    session,
    shop: session.shop,
    scope: session.scope,
    requestedScopes:
      payload?.data?.app?.requestedAccessScopes?.map((s) => s.handle) || [],
    installedScopes:
      payload?.data?.app?.installation?.accessScopes?.map((s) => s.handle) || [],
    webPixel: payload?.data?.webPixel || null,
    webhookSubscriptions: payload?.data?.webhookSubscriptions?.edges || [],
    errors: payload?.errors || null,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const data = await fetchIntegrationData(request);
  return {
    shop: data.shop,
    scope: data.scope,
    requestedScopes: data.requestedScopes,
    installedScopes: data.installedScopes,
    webPixel: data.webPixel,
    webhookSubscriptions: data.webhookSubscriptions,
    errors: data.errors,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  if (!session.accessToken) {
    return { pixelRepair: "Missing access token; reinstall the app." };
  }

  const result = await ensureWebPixelConnected(
    { shop: session.shop, accessToken: session.accessToken },
    apiVersion,
  );

  return {
    pixelRepair: `Pixel ${result.status}${result.webPixelId ? ` (${result.webPixelId})` : ""}`,
  };
};

export default function IntegrationStatus() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

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

      <s-section heading="Web Pixel">
        <s-paragraph>
          {data.webPixel?.id ? `Connected (${data.webPixel.id})` : "Not connected"}
        </s-paragraph>
        {data.webPixel?.settings ? (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <pre style={{ margin: 0 }}>
              <code>{data.webPixel.settings}</code>
            </pre>
          </s-box>
        ) : null}
        <Form method="post">
          <s-button type="submit" disabled={submitting}>
            {submitting ? "Reconnecting…" : "Reconnect pixel"}
          </s-button>
        </Form>
        {actionData?.pixelRepair ? (
          <s-paragraph>{actionData.pixelRepair}</s-paragraph>
        ) : null}
      </s-section>

      <s-section heading="Webhook Delivery">
        <s-paragraph>
          Lifecycle and compliance webhooks are processed by this app:
        </s-paragraph>
        <s-unordered-list>
          {LOCAL_WEBHOOKS.map((entry) => (
            <s-list-item key={`${entry.topic}-${entry.uri}`}>
              <code>{entry.topic}</code> → <code>{entry.uri}</code>
            </s-list-item>
          ))}
        </s-unordered-list>
        <s-paragraph>
          Order / refund / fulfillment events are delivered directly to the backend by Shopify (configured in <code>shopify.app.toml</code>):
        </s-paragraph>
        <s-unordered-list>
          {DIRECT_WEBHOOKS.map((topic) => (
            <s-list-item key={topic}>
              <code>{topic}</code>
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section heading="Live Webhook Subscriptions (Admin API)">
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
