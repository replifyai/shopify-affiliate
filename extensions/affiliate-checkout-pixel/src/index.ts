import type { WebPixelExtensionPoint } from "@shopify/web-pixels-extension";

const ENDPOINT =
  "https://asia-south1-touch-17fa9.cloudfunctions.net/pixelWebhook";

const webPixel: WebPixelExtensionPoint = ({ analytics }) => {
  analytics.subscribe("checkout_completed", async (event) => {
    try {
      const checkout = event.data?.checkout;
      const order = checkout?.order;

      const payload = {
        event: "checkout_completed",
        timestamp: new Date().toISOString(),

        shop:
          event.context?.document?.location?.hostname || null,

        order_id: order?.id || null,
        order_name: order?.name || null,
        order_number: order?.order_number || null,

        email: checkout?.email || null,
        currency: checkout?.currencyCode || null,

        // IMPORTANT: amounts are in minor units (paise)
        total: checkout?.totalPrice?.amount || null,

        customer_id: order?.customer?.id || null,

        // Raw event for debugging / future use
        data: event
      };

      await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch (err) {
      // Never break checkout
      console.error("Affiliate web pixel error", err);
    }
  });
};

export default webPixel;
