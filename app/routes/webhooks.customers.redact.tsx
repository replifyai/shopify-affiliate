import type { ActionFunctionArgs } from "react-router";
import { handleCustomersRedactWebhook } from "../gdpr-webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return handleCustomersRedactWebhook(request);
};
