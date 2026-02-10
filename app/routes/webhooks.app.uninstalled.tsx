import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { markShopUninstalled } from "../shopify-shop.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    await markShopUninstalled(shop);
  } catch (error) {
    console.error(`Failed to mark ${shop} as uninstalled in shop token table:`, error);
  }

  try {
    const sessions = await sessionStorage.findSessionsByShop(shop);
    await sessionStorage.deleteSessions(sessions.map((stored) => stored.id));
  } catch (error) {
    console.error(`Failed to delete app sessions for ${shop}:`, error);
  }

  return new Response();
};
