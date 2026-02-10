import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { dbReady } from "./db.server";
import { ensureWebPixelConnected } from "./pixels.server";
import { PostgresSessionStorage } from "./session-storage.server";
import { upsertShopToken } from "./shopify-shop.server";
import { syncSessionToBackend } from "./token-sync.server";

const REQUIRED_SCOPES = [
  "read_fulfillments",
  "read_orders",
  "write_products",
  "write_discounts",
  "read_discounts",
  "write_price_rules",
  "read_price_rules",
  "write_pixels",
  "read_customer_events",
];

const envScopes = (process.env.SCOPES || "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

const appScopes = Array.from(new Set([...envScopes, ...REQUIRED_SCOPES]));

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: appScopes,
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PostgresSessionStorage(dbReady),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      if (!session.accessToken) {
        console.error(`Missing access token for ${session.shop} during afterAuth`);
        return;
      }

      try {
        await upsertShopToken({
          shopDomain: session.shop,
          accessToken: session.accessToken,
          scopes: session.scope || null,
          locale: session.onlineAccessInfo?.associated_user?.locale || null,
          associatedUserScope:
            session.onlineAccessInfo?.associated_user_scope || null,
        });
      } catch (error) {
        console.error(
          `Failed to upsert shop token for ${session.shop}:`,
          error,
        );
      }

      // Webhooks stay config-based; only ensure the app pixel is connected.
      await ensureWebPixelConnected(
        { shop: session.shop, accessToken: session.accessToken },
        ApiVersion.October25,
      );

      // Optional: forward tokens to an external backend if configured.
      await syncSessionToBackend(session);
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
