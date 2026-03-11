import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhookRequest } from "../webhook-utils.server";
import {
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
} from "../gdpr-webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Authenticate once — verifies HMAC signature before any processing
  const webhook = await authenticateWebhookRequest(request);

  switch (webhook.topic) {
    case "customers/data_request":
      return handleCustomersDataRequest(webhook);
    case "customers/redact":
      return handleCustomersRedact(webhook);
    case "shop/redact":
      return handleShopRedact(webhook);
    default:
      return new Response(undefined, { status: 200 });
  }
};
