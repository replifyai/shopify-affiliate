import { register } from "@shopify/web-pixels-extension";

const ENDPOINT =
  "https://asia-south1-touch-17fa9.cloudfunctions.net/pixelWebhook";

type CheckoutCompletedEvent = {
  data?: {
    checkout?: {
      order?: {
        id?: string | null;
        name?: string | null;
        order_number?: number | null;
        customer?: { id?: string | null } | null;
      } | null;
      email?: string | null;
      currencyCode?: string | null;
      totalPrice?: { amount?: string | number | null } | null;
    } | null;
  };
  id?: string;
};

register(({ analytics, init }) => {
  const defaultShopDomain = init?.data?.shop?.myshopifyDomain || null;

  analytics.subscribe("checkout_completed", async (event: unknown) => {
    try {
      const checkoutEvent = event as CheckoutCompletedEvent;
      const checkout = checkoutEvent.data?.checkout;
      const order = checkout?.order;

      const payload = {
        event: "checkout_completed",
        timestamp: new Date().toISOString(),
        shop: defaultShopDomain,

        order_id: order?.id || null,
        order_name: order?.name || null,
        order_number: order?.order_number || null,

        email: checkout?.email || null,
        currency: checkout?.currencyCode || null,

        // IMPORTANT: amounts are in minor units (paise)
        total: checkout?.totalPrice?.amount || null,

        customer_id: order?.customer?.id || null,
        event_id: checkoutEvent.id || null,
      };

      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (err) {
      // Never break checkout
      console.error("Affiliate web pixel error", err);
    }
  });
});
