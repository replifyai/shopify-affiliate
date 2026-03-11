import type { ActionFunctionArgs } from "react-router";
import { forwardWebhookRequest } from "../webhook-utils.server";

const DEFAULT_FORWARD_URL =
  "https://shopifyallinone-dkhjjaxofq-el.a.run.app/";

export const action = async ({ request }: ActionFunctionArgs) => {
  return forwardWebhookRequest(request, {
    envUrlKeys: [
      "ORDER_CREATE_WEBHOOK_FORWARD_URL",
      "ORDER_EVENTS_WEBHOOK_FORWARD_URL",
    ],
    fallbackUrl: DEFAULT_FORWARD_URL,
  });
};
