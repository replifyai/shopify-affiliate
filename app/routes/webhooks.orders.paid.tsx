import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { forwardWebhookToBackend } from "../webhook-forward.server";

const DEFAULT_FORWARD_URL = "https://shopifyordercancelled-dkhjjaxofq-el.a.run.app/";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} received for ${shop}`);

  const targetUrl =
    process.env.ORDER_EVENTS_WEBHOOK_FORWARD_URL || DEFAULT_FORWARD_URL;
  await forwardWebhookToBackend({
    targetUrl,
    topic,
    shop,
    payload,
  });

  return new Response();
};
