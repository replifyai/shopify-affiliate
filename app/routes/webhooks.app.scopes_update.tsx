import type { ActionFunctionArgs } from "react-router";
import { authenticate, sessionStorage } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, topic, shop } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} received for ${shop}`);

  const current = Array.isArray((payload as { current?: unknown }).current)
    ? (payload as { current: unknown[] }).current.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];
  const scopeCsv = current?.join(",") || null;

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
