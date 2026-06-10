import type { ActionFunctionArgs } from "react-router";
import { callBackend } from "../backend-api.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const triggeredAtHeader = request.headers.get("x-shopify-triggered-at");
  const parsedTriggeredAt = triggeredAtHeader ? Date.parse(triggeredAtHeader) : NaN;
  const triggeredAtMs = Number.isFinite(parsedTriggeredAt)
    ? parsedTriggeredAt
    : Date.now();

  const { shop, topic } = await authenticate.webhook(request);
  console.log(
    `[webhook] ${topic} received for ${shop} (triggered_at=${triggeredAtHeader ?? "n/a"})`,
  );

  try {
    const result = await callBackend<{ ok: boolean; deleted: number }>({
      path: "/sessions/delete-by-shop",
      body: { shop, triggeredAtMs },
    });
    console.log(
      `[webhook] APP_UNINSTALLED for ${shop}: backend deleted ${result.deleted ?? 0} stale session(s)`,
    );
  } catch (error) {
    console.error(`Failed to forward uninstall to backend for ${shop}:`, error);
  }

  return new Response();
};
