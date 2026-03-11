import type { ActionFunctionArgs } from "react-router";
import { handleShopRedactWebhook } from "../gdpr-webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return handleShopRedactWebhook(request);
};
