import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { forwardWebhookToBackend } from "../webhook-forward.server";

const DEFAULT_FORWARD_URL =
  "https://asia-south1-touch-17fa9.cloudfunctions.net/shopifyOrderCreated";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} received for ${shop} with Payload: ${JSON.stringify(payload)}`);

  const targetUrl =
    process.env.ORDER_CREATE_WEBHOOK_FORWARD_URL || DEFAULT_FORWARD_URL;
  await forwardWebhookToBackend({
    targetUrl,
    topic,
    shop,
    payload,
  });

  return new Response();
};
