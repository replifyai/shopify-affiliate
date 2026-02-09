import { register } from "@shopify/web-pixels-extension";

const ENDPOINT =
  "https://asia-south1-touch-17fa9.cloudfunctions.net/pixelWebhook";

type AnyPayload = Record<string, any>;
type BrowserApi = {
  cookie: {
    get(name?: string): Promise<string>;
  };
};

async function getCookie(browser: BrowserApi, name: string): Promise<string> {
  try {
    return (await browser.cookie.get(name)) || "";
  } catch {
    return "";
  }
}

function extractOrderInfo(payload: AnyPayload = {}) {
  const order =
    payload?.data?.checkout?.order ||
    payload?.checkout?.order ||
    payload?.order ||
    payload?.data?.order ||
    null;

  if (!order) return null;

  return {
    order_id: order.id || null,
    order_name: order.name || null,
    order_number: order.order_number || null,
  };
}

async function buildMinimalPayload(
  eventName: string,
  payload: AnyPayload = {},
  browser: BrowserApi,
  fallbackContext?: {
    hostname?: string | null;
    pathname?: string | null;
    referrer?: string | null;
  },
) {
  const shopHost =
    payload?.context?.document?.location?.hostname ||
    payload?.context?.window?.location?.hostname ||
    fallbackContext?.hostname ||
    null;

  const path =
    payload?.context?.document?.location?.pathname ||
    payload?.context?.window?.location?.pathname ||
    fallbackContext?.pathname ||
    null;

  const referrer =
    payload?.context?.document?.referrer || fallbackContext?.referrer || "";

  const currency =
    payload?.context?.currency ||
    payload?.data?.checkout?.currencyCode ||
    payload?.checkout?.currencyCode ||
    null;

  const customerId =
    payload?.customer?.id ||
    payload?.data?.checkout?.order?.customer?.id ||
    payload?.data?.order?.customer?.id ||
    null;

  const orderInfo = extractOrderInfo(payload);

  return {
    event: eventName,
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
      payload?.data?.checkout?.email ||
      payload?.checkout?.email ||
      payload?.order?.email ||
      payload?.data?.order?.email ||
      null,
    total:
      payload?.data?.checkout?.totalPrice?.amount ||
      payload?.data?.checkout?.totalPrice ||
      payload?.totalPrice ||
      null,
    data: payload,
  };
}

async function sendEvent(
  eventName: string,
  payload: AnyPayload,
  browser: BrowserApi,
  fallbackContext?: {
    hostname?: string | null;
    pathname?: string | null;
    referrer?: string | null;
  },
) {
  try {
    const body = await buildMinimalPayload(
      eventName,
      payload,
      browser,
      fallbackContext,
    );

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(body),
    }).catch((err) => console.error("Pixel fetch error:", err));
  } catch (err) {
    console.error("Pixel tracking error:", err);
  }
}

register(({ analytics, browser, init }) => {
  const fallbackContext = {
    hostname: init?.context?.document?.location?.hostname || null,
    pathname: init?.context?.document?.location?.pathname || null,
    referrer: init?.context?.document?.referrer || null,
  };

  analytics.subscribe("checkout_completed", async (event: unknown) => {
    await sendEvent(
      "checkout_completed",
      (event as AnyPayload) || {},
      browser,
      fallbackContext,
    );
  });
});
