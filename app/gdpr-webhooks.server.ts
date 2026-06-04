import type { AuthenticatedWebhook } from "./webhook-utils.server";
import { authenticateWebhookRequest } from "./webhook-utils.server";
import { sessionStorage } from "./shopify.server";

function parseShopDomain(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const domain = (payload as { shop_domain?: unknown }).shop_domain;
  return typeof domain === "string" && domain.trim() ? domain : null;
}

function parseCustomerId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const customer = (payload as { customer?: { id?: unknown } }).customer;
  if (!customer || typeof customer !== "object") return null;
  const id = customer.id;
  if (typeof id === "string" && id.trim()) return id;
  if (typeof id === "number") return String(id);
  return null;
}

export async function handleCustomersDataRequest(webhook: AuthenticatedWebhook) {
  const { topic, shop, payload } = webhook;
  const customerId = parseCustomerId(payload);
  console.log(
    `[gdpr] ${topic} received for ${shop}${customerId ? ` (customer: ${customerId})` : ""}`,
  );
  return new Response();
}

export async function handleCustomersRedact(webhook: AuthenticatedWebhook) {
  const { topic, shop, payload } = webhook;
  const customerId = parseCustomerId(payload);
  console.log(
    `[gdpr] ${topic} received for ${shop}${customerId ? ` (customer: ${customerId})` : ""}`,
  );
  return new Response();
}

export async function handleShopRedact(webhook: AuthenticatedWebhook) {
  const { topic, shop, payload } = webhook;
  const shopDomain = parseShopDomain(payload) || shop;
  console.log(`[gdpr] ${topic} received for ${shopDomain}`);

  try {
    const sessions = await sessionStorage.findSessionsByShop(shopDomain);
    await sessionStorage.deleteSessions(sessions.map((stored) => stored.id));
  } catch (error) {
    console.error(`Failed to delete sessions for ${shopDomain} during shop/redact:`, error);
    return Response.json(
      { ok: false, error: "Failed to process shop redaction request" },
      { status: 500 },
    );
  }

  return new Response();
}

export async function handleCustomersDataRequestWebhook(request: Request) {
  const webhook = await authenticateWebhookRequest(request);
  return handleCustomersDataRequest(webhook);
}

export async function handleCustomersRedactWebhook(request: Request) {
  const webhook = await authenticateWebhookRequest(request);
  return handleCustomersRedact(webhook);
}

export async function handleShopRedactWebhook(request: Request) {
  const webhook = await authenticateWebhookRequest(request);
  return handleShopRedact(webhook);
}
