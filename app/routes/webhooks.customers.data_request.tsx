import type { ActionFunctionArgs } from "react-router";
import { handleCustomersDataRequestWebhook } from "../gdpr-webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return handleCustomersDataRequestWebhook(request);
};
