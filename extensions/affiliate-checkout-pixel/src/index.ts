import { register } from "@shopify/web-pixels-extension";

const DEFAULT_ENDPOINT = "https://affiliateapp.saleshq.ai/api/pixel/track";

type Payload = Record<string, unknown>;
type BrowserApi = {
  cookie: {
    get(name?: string): Promise<string>;
  };
};

type FallbackContext = {
  hostname?: string | null;
  pathname?: string | null;
  referrer?: string | null;
};

function asPayload(value: unknown): Payload {
  if (value && typeof value === "object") {
    return value as Payload;
  }
  return {};
}

function readPath(source: unknown, path: string[]) {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Payload)[key];
  }
  return current;
}

function readString(source: unknown, path: string[]) {
  const value = readPath(source, path);
  return typeof value === "string" ? value : null;
}

function readStringOrNumber(source: unknown, path: string[]) {
  const value = readPath(source, path);
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function readNumber(source: unknown, path: string[]) {
  const value = readPath(source, path);
  return typeof value === "number" ? value : null;
}

async function getCookie(browser: BrowserApi, name: string): Promise<string> {
  try {
    return (await browser.cookie.get(name)) || "";
  } catch {
    return "";
  }
}

function extractOrderInfo(payload: Payload) {
  const order = (readPath(payload, ["data", "checkout", "order"]) ||
    readPath(payload, ["checkout", "order"]) ||
    readPath(payload, ["order"]) ||
    readPath(payload, ["data", "order"])) as Payload | undefined;

  if (!order || typeof order !== "object") return null;

  return {
    order_id: readStringOrNumber(order, ["id"]),
    order_name: readString(order, ["name"]),
    order_number: readStringOrNumber(order, ["order_number"]),
  };
}

async function buildPayload(
  eventName: string,
  accountID: string,
  payload: Payload,
  browser: BrowserApi,
  fallbackContext?: FallbackContext,
) {
  const shopHost =
    readString(payload, ["context", "document", "location", "hostname"]) ||
    readString(payload, ["context", "window", "location", "hostname"]) ||
    fallbackContext?.hostname ||
    null;

  const path =
    readString(payload, ["context", "document", "location", "pathname"]) ||
    readString(payload, ["context", "window", "location", "pathname"]) ||
    fallbackContext?.pathname ||
    null;

  const referrer =
    readString(payload, ["context", "document", "referrer"]) ||
    fallbackContext?.referrer ||
    "";

  const currency =
    readString(payload, ["context", "currency"]) ||
    readString(payload, ["data", "checkout", "currencyCode"]) ||
    readString(payload, ["checkout", "currencyCode"]) ||
    null;

  const customerId =
    readStringOrNumber(payload, ["customer", "id"]) ||
    readStringOrNumber(payload, ["data", "checkout", "order", "customer", "id"]) ||
    readStringOrNumber(payload, ["data", "order", "customer", "id"]) ||
    null;

  const orderInfo = extractOrderInfo(payload);
  const total =
    readNumber(payload, ["data", "checkout", "totalPrice", "amount"]) ??
    readNumber(payload, ["data", "checkout", "totalPrice"]) ??
    readNumber(payload, ["totalPrice"]);

  return {
    event: eventName,
    accountID,
    shop: shopHost,
    path,
    referrer,
    timestamp: new Date().toISOString(),
    currency,
    customerId,
    shop_ref: (await getCookie(browser, "__hqref")) || "",
    sm_channel: (await getCookie(browser, "__hqsmchannel")) || "",
    ...(orderInfo || {}),
    email:
      readString(payload, ["data", "checkout", "email"]) ||
      readString(payload, ["checkout", "email"]) ||
      readString(payload, ["order", "email"]) ||
      readString(payload, ["data", "order", "email"]) ||
      null,
    total,
    data: payload,
  };
}

async function sendEvent(
  endpoint: string,
  eventName: string,
  accountID: string,
  payload: Payload,
  browser: BrowserApi,
  fallbackContext?: FallbackContext,
) {
  try {
    const body = await buildPayload(
      eventName,
      accountID,
      payload,
      browser,
      fallbackContext,
    );

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(body),
    }).catch((error) => console.error("Pixel fetch error:", error));
  } catch (error) {
    console.error("Pixel tracking error:", error);
  }
}

type Settings = {
  accountID?: string;
  endpointUrl?: string;
};

register(({ analytics, browser, init, settings }) => {
  const cfg = (settings as Settings | undefined) || {};
  const endpoint = (cfg.endpointUrl && cfg.endpointUrl.trim()) || DEFAULT_ENDPOINT;
  const accountID = (cfg.accountID && cfg.accountID.trim()) || "";

  const initialContext = asPayload(init);
  const fallbackContext: FallbackContext = {
    hostname:
      readString(initialContext, ["context", "document", "location", "hostname"]) ||
      null,
    pathname:
      readString(initialContext, ["context", "document", "location", "pathname"]) ||
      null,
    referrer: readString(initialContext, ["context", "document", "referrer"]) || null,
  };

  analytics.subscribe("checkout_completed", async (event: unknown) => {
    await sendEvent(
      endpoint,
      "checkout_completed",
      accountID,
      asPayload(event),
      browser,
      fallbackContext,
    );
  });
});
