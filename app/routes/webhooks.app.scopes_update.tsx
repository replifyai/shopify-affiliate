import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";
import { updateShopScopes } from "../shopify-shop.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const current = payload.current as string[];
  const scopeCsv = current?.join(",") || null;

  try {
    await updateShopScopes(shop, scopeCsv);
  } catch (error) {
    console.error(`Failed to update scopes in shopity_shop for ${shop}:`, error);
  }

  try {
    const sessions = await sessionStorage.findSessionsByShop(shop);
    for (const existingSession of sessions) {
      existingSession.scope = scopeCsv || undefined;
      await sessionStorage.storeSession(existingSession);
    }
  } catch (error) {
    console.error(`Failed to update app sessions scope for ${shop}:`, error);
  }

  return new Response();
};
