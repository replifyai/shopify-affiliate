import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const FORWARD_URL = process.env.PIXEL_FORWARD_URL || "";
const FORWARD_SECRET = process.env.PIXEL_FORWARD_SECRET || "";

type PixelEvent = {
  event?: unknown;
  accountID?: unknown;
  shop?: unknown;
  [key: string]: unknown;
};

function corsResponse(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers || {}) },
  });
}

async function forwardEvent(event: PixelEvent) {
  if (!FORWARD_URL) return;

  try {
    await fetch(FORWARD_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The AWS /pixel ingest endpoint requires this shared secret and rejects
        // (401) any request without it. Set PIXEL_FORWARD_SECRET to match the
        // backend's PIXEL_SHARED_SECRET.
        ...(FORWARD_SECRET ? { "x-pixel-secret": FORWARD_SECRET } : {}),
      },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error("[pixel-track] forward failed:", error);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST, OPTIONS", ...CORS_HEADERS },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return corsResponse({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let body: PixelEvent | null = null;
  try {
    body = (await request.json()) as PixelEvent;
  } catch {
    return corsResponse({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return corsResponse({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  if (typeof body.event !== "string" || !body.event.trim()) {
    return corsResponse({ ok: false, error: "Missing event" }, { status: 400 });
  }

  console.log(
    `[pixel-track] ${body.event} accountID=${body.accountID ?? "?"} shop=${body.shop ?? "?"}`,
  );

  forwardEvent(body).catch(() => {});

  // temporary diagnostic — remove after verifying pixel forwarding
  return corsResponse({ ok: true, _fwd: FORWARD_URL ? "set" : "EMPTY", _sec: FORWARD_SECRET ? "set" : "EMPTY" });
};
