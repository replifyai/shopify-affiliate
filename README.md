# Affiliate-Saleshq Shopify App

Shopify Admin app that tracks affiliate-driven traffic and orders for SalesHQ stores.

Built on [@shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) with React Router 7, Polaris Web Components, and Postgres session storage.

> **Full architecture, data-flow diagrams, schemas, and deploy checklist** live in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Start there if you're new to the system.

## Architecture

```
Shopify storefront ──► Web pixel extension ──► /api/pixel/track ──► (optional) PIXEL_FORWARD_URL
Shopify admin      ──► OAuth                 ──► PostgresSessionStorage
Shopify webhooks   ─┬─► /webhooks/app/uninstalled       (local — clears sessions)
                    ├─► /webhooks/app/scopes_update     (local — updates session scope)
                    ├─► /webhooks/gdpr                  (local — compliance topics)
                    └─► shopifyallinone-...a.run.app    (direct — order / refund / fulfillment events)
Backend service    ──► /api/token/resolve, /internal/shopify/* (gateway, shared-secret auth)
```

### Session storage

`PostgresSessionStorage` in `app/session-storage.server.ts` is the sole source of truth for OAuth tokens. The session table is bootstrapped at boot in `app/db.server.ts`.

There is **no** separate `shopify_shop` / `shopity_shop` table maintained by this app. If the backend needs the offline token, it asks for it via `/api/token/resolve`.

### Webhook delivery

Configured in [`shopify.app.affiliate-saleshq.toml`](./shopify.app.affiliate-saleshq.toml):

- **Local routes** — Shopify lifecycle (`app/uninstalled`, `app/scopes_update`) and compliance topics (`customers/data_request`, `customers/redact`, `shop/redact` → consolidated `/webhooks/gdpr`).
- **Direct to backend** — `orders/*`, `refunds/create`, `fulfillments/*` are delivered straight from Shopify to the backend Cloud Run URL. The backend verifies the HMAC using `SHOPIFY_API_SECRET`.

### Web pixel

The `affiliate-checkout-pixel` extension reads two settings:

- `accountID` — passed with every event.
- `endpointUrl` — where the pixel POSTs each event. Defaults to `https://affiliateapp.saleshq.ai/api/pixel/track` if absent.

`ensureWebPixelConnected` in `app/pixels.server.ts` runs in `afterAuth`. It creates the pixel if missing, or updates settings if drift is detected. Default `endpointUrl` is derived from `SHOPIFY_APP_URL`; override with `PIXEL_ENDPOINT_URL`.

The `/api/pixel/track` route accepts JSON, logs it, and (optionally) forwards to `PIXEL_FORWARD_URL`. CORS is open since the pixel runs on the storefront origin.

### Internal gateway

`app/internal-gateway.server.ts` is the shared auth layer for backend → app calls. Authenticated with a shared secret (`INTERNAL_GATEWAY_SECRET`, with several legacy aliases for backwards compat). Endpoints:

- `POST /api/token/resolve` — return the current offline token for a shop.
- `GET|PATCH /internal/shopify/coupons` — read & update discount codes.
- `POST /internal/shopify/admin/graphql` — pass-through to the Admin GraphQL API.

## Environment variables

| Var | Required | Purpose |
| --- | --- | --- |
| `SHOPIFY_API_KEY` | yes | App client ID |
| `SHOPIFY_API_SECRET` | yes | App secret (also used by the backend to verify direct-delivery webhooks) |
| `SHOPIFY_APP_URL` | yes | Public app URL (used for OAuth redirects and pixel endpoint default) |
| `SCOPES` | no | CSV of OAuth scopes, merged with hard-coded required set |
| `DATABASE_URL` | yes (prod) | Postgres connection string |
| `INTERNAL_GATEWAY_SECRET` | recommended | Shared secret for backend → app calls |
| `TOKEN_SYNC_URL` | optional | If set, sessions are POSTed here after install / token refresh |
| `TOKEN_SYNC_SECRET` | optional | Sent as `X-Token-Sync-Secret` when calling `TOKEN_SYNC_URL` |
| `PIXEL_ENDPOINT_URL` | optional | Override the pixel's POST target (defaults to `${SHOPIFY_APP_URL}/api/pixel/track`) |
| `PIXEL_FORWARD_URL` | optional | If set, `/api/pixel/track` forwards events here |
| `PIXEL_ACCOUNT_ID` | optional | Override pixel `accountID` (defaults to `session.shop`) |
| `SHOP_CUSTOM_DOMAIN` | optional | Additional permitted shop domain for embedded auth |

## Local development

```sh
npm install
npm run dev      # uses shopify.app.affiliate-saleshq.toml
```

A local Postgres at `postgresql://postgres:postgres@localhost:5432/postgres` is used if `DATABASE_URL` isn't set.

## Build & deploy

```sh
npm run build
npm run start
# or
docker build . && docker run -p 3000:3000 ...
```

Deploy configuration changes (webhooks / scopes / extensions) with:

```sh
npm run deploy
```

This pushes `shopify.app.affiliate-saleshq.toml` and the extension manifests to the Partner Dashboard.

## Notes

- API version is pinned to `2025-10` in both code and the TOML.
- Shopify CLI commands default to the affiliate-saleshq config; if you ever add a second `shopify.app.*.toml`, pass it explicitly with `-c`.
- The `shopify-app-template-react-router` README has been removed; this project no longer uses Prisma or SQLite.
