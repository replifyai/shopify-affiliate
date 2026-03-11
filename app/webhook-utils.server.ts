import { authenticate } from "./shopify.server";
import { forwardWebhookToBackend } from "./webhook-forward.server";

export type AuthenticatedWebhook = {
  topic: string;
  shop: string;
  payload: unknown;
};

type ForwardWebhookOptions = {
  envUrlKeys: string[];
  fallbackUrl: string;
};

function resolveTargetUrl(options: ForwardWebhookOptions) {
  for (const key of options.envUrlKeys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return options.fallbackUrl;
}

export async function authenticateWebhookRequest(
  request: Request,
): Promise<AuthenticatedWebhook> {
  const { payload, topic, shop } = await authenticate.webhook(request);
  return { payload, topic, shop };
}

export async function forwardWebhookRequest(
  request: Request,
  options: ForwardWebhookOptions,
) {
  const webhook = await authenticateWebhookRequest(request);
  const targetUrl = resolveTargetUrl(options);

  await forwardWebhookToBackend({
    targetUrl,
    topic: webhook.topic,
    shop: webhook.shop,
    payload: webhook.payload,
  });

  return new Response();
}
