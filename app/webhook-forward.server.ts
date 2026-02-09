type ForwardWebhookInput = {
  targetUrl: string;
  topic: string;
  shop: string;
  payload: unknown;
};

export async function forwardWebhookToBackend({
  targetUrl,
  topic,
  shop,
  payload,
}: ForwardWebhookInput) {
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Topic": topic,
        "X-Shopify-Shop-Domain": shop,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[webhook-forward] ${topic} for ${shop} failed: ${response.status} ${response.statusText}`,
      );
      return false;
    }

    console.log(
      `[webhook-forward] ${topic} for ${shop} forwarded to ${targetUrl}`,
    );
    return true;
  } catch (error) {
    console.error(
      `[webhook-forward] ${topic} for ${shop} exception while forwarding to ${targetUrl}:`,
      error,
    );
    return false;
  }
}
