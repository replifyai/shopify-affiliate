import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} received for ${shop}`);

  try {
    const sessions = await sessionStorage.findSessionsByShop(shop);
    await sessionStorage.deleteSessions(sessions.map((stored) => stored.id));
  } catch (error) {
    console.error(`Failed to delete app sessions for ${shop}:`, error);
  }

  return new Response();
};
