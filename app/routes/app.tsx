import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { syncSessionToBackend } from "../token-sync.server";

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;
const lastSyncedAt = new Map<string, number>();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Self-heal: re-push the offline token to the backend on each /app load,
  // throttled per shop per Lambda. Recovers automatically once the backend
  // /shop-token endpoint becomes healthy after a prior 503/outage.
  if (session && !session.isOnline && session.accessToken) {
    const previous = lastSyncedAt.get(session.shop) ?? 0;
    if (Date.now() - previous > RESYNC_INTERVAL_MS) {
      lastSyncedAt.set(session.shop, Date.now());
      void syncSessionToBackend({
        shop: session.shop,
        accessToken: session.accessToken,
        scope: session.scope || null,
        isOnline: session.isOnline,
        expires: session.expires || null,
        refreshToken: session.refreshToken || null,
        refreshTokenExpires: session.refreshTokenExpires || null,
      }).catch((error) => {
        lastSyncedAt.delete(session.shop);
        console.error(`[app] background re-sync failed for ${session.shop}:`, error);
      });
    }
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <a href="/app">Home</a>
        <a href="/app/additional">Setup guide</a>
        <a href="/app/integration-status">Integration status</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
