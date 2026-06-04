import { authenticate } from "./shopify.server";

export type AuthenticatedWebhook = {
  topic: string;
  shop: string;
  payload: unknown;
};

export async function authenticateWebhookRequest(
  request: Request,
): Promise<AuthenticatedWebhook> {
  const { payload, topic, shop } = await authenticate.webhook(request);
  return { payload, topic, shop };
}
