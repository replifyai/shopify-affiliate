/**
 * Register external webhook subscriptions using the GraphQL Admin API.
 * These webhooks deliver directly to external Cloud Functions / Cloud Run
 * endpoints — the app does NOT process these payloads.
 */

const WEBHOOK_SUBSCRIPTIONS = [
  {
    topic: "ORDERS_CREATE",
    uri: "https://asia-south1-touch-17fa9.cloudfunctions.net/shopifyOrderCreated",
  },
  {
    topic: "ORDERS_PAID",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "ORDERS_UPDATED",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "ORDERS_CANCELLED",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "REFUNDS_CREATE",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "FULFILLMENTS_CREATE",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
  {
    topic: "FULFILLMENTS_UPDATE",
    uri: "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/",
  },
];

const WEBHOOK_MUTATION = `
  mutation webhookSubscriptionCreate(
    $topic: WebhookSubscriptionTopic!
    $webhookSubscription: WebhookSubscriptionInput!
  ) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: $webhookSubscription
    ) {
      webhookSubscription {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function registerExternalWebhooks(
  session: { shop: string; accessToken: string },
  apiVersion: string,
) {
  console.log(`Registering external webhooks for ${session.shop}...`);

  for (const { topic, uri } of WEBHOOK_SUBSCRIPTIONS) {
    try {
      const response = await fetch(
        `https://${session.shop}/admin/api/${apiVersion}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": session.accessToken,
          },
          body: JSON.stringify({
            query: WEBHOOK_MUTATION,
            variables: {
              topic,
              webhookSubscription: {
                uri,
                format: "JSON",
              },
            },
          }),
        },
      );

      const data = await response.json();
      const errors =
        data?.data?.webhookSubscriptionCreate?.userErrors;
      const id =
        data?.data?.webhookSubscriptionCreate?.webhookSubscription?.id;

      if (errors?.length) {
        console.error(`Webhook ${topic} registration error:`, errors);
      } else {
        console.log(`Webhook ${topic} registered (${id}) → ${uri}`);
      }
    } catch (error) {
      console.error(`Webhook ${topic} registration failed:`, error);
    }
  }
}
