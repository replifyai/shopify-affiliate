# SalesHQ Affiliate Tracking — Architecture & Data Flow

End-to-end reference for how the **Shopify app** (`shopify-affiliate/`) and the
**backend** (`touch-backend/`) cooperate to attribute affiliate traffic, persist
orders, calculate commissions, and serve the creator/admin dashboards.

> Audience: engineers picking up the system cold. Skim section 1 for the
> mental model, deep-read sections 4–6 for the data flow.

---

## 1. System overview at a glance

```mermaid
flowchart LR
  subgraph Storefront["Customer browser (storefront)"]
    Pixel["Web Pixel<br/>affiliate-checkout-pixel"]
    Embed["Theme Embed<br/>affiliate-tracking-embed"]
  end

  subgraph Shopify["Shopify platform"]
    Admin["Shopify Admin"]
    Hooks["Webhook delivery"]
    GQL["Admin GraphQL API"]
  end

  subgraph App["Shopify app — shopify-affiliate<br/>(React Router 7, @shopify/shopify-app-react-router)"]
    AppOAuth["OAuth + session storage"]
    AppRoutes["Embedded admin UI<br/>(/app/*)"]
    AppWebhooks["/webhooks/app/uninstalled<br/>/webhooks/app/scopes_update<br/>/webhooks/gdpr"]
    AppAPI["/api/pixel/track<br/>/api/token/resolve<br/>/internal/shopify/*"]
    AppDB[(app Postgres<br/>shopify_app_session)]
  end

  subgraph Backend["Backend — touch-backend<br/>(Firebase Functions, asia-south1)"]
    BWebhooks["shopifyAllInOne<br/>(HMAC + dispatcher)"]
    BPixel["pixelWebhook"]
    BSync["internalSync /shop-token"]
    BDash["dashboardApi"]
    BRazor["razorpayWebhook"]
    BCron["Scheduled jobs"]
    BDB[(Neon Postgres<br/>orders, refunds,<br/>shopify_shop,<br/>provisional_commissions,<br/>earnings_ledger, …)]
  end

  Dashboards["Creator + Admin<br/>dashboards (Next.js)"]
  Razorpay["Razorpay X"]

  Embed -- cookies + cart attrs --> Storefront
  Pixel -- checkout_completed --> AppAPI
  AppAPI -- forward --> BPixel
  BPixel --> BDB

  Admin -- install / re-auth --> AppOAuth
  AppOAuth -- afterAuth: token sync --> BSync
  AppOAuth -- afterAuth: install pixel --> GQL
  AppRoutes -- session-authed admin calls --> GQL
  AppOAuth --- AppDB
  BSync --> BDB

  Hooks -- "orders/*, refunds/*, fulfillments/*" --> BWebhooks
  Hooks -- "app/uninstalled, app/scopes_update, GDPR" --> AppWebhooks
  AppWebhooks --- AppDB
  BWebhooks --> BDB

  Backend -- "Admin GraphQL on behalf of shop" --> AppAPI
  AppAPI -- session token --> GQL

  Dashboards -- HTTPS --> BDash
  BDash --> BDB
  Razorpay -- payout status --> BRazor
  BCron --> BDB
```

Two services, one Postgres each, one shared truth (Shopify):

| Layer | Owns |
|---|---|
| Shopify app | OAuth, offline tokens, web pixel install, embedded admin UI, lifecycle/compliance webhooks, an internal gateway that lends sessions to the backend |
| Backend | Affiliate attribution logic, orders/refunds/fulfillments ingestion, commission ledger, dashboard APIs, scheduled jobs, payouts |
| Shopify | Auth grants, webhook delivery, admin GraphQL |

---

## 2. Components in detail

### 2.1 Shopify app (`shopify-affiliate/`)

Stack: React Router 7, `@shopify/shopify-app-react-router` v1, Polaris Web
Components, `pg` for Postgres, deployed publicly at
`https://affiliateapp.saleshq.ai`.

Key modules:

| File | Role |
|---|---|
| `app/shopify.server.ts` | Configures `shopifyApp(...)`. Declares scopes, API version (`2025-10`), session storage adapter. `afterAuth` hook fires once per install / token refresh — calls `ensureWebPixelConnected` + `syncSessionToBackend`. |
| `app/db.server.ts` | Single pg `Pool`. Bootstraps `public.shopify_app_session` on boot. |
| `app/session-storage.server.ts` | `PostgresSessionStorage` implements `SessionStorage`. After persisting an offline session, fires `syncSessionToBackend` so the backend always has a fresh token. |
| `app/pixels.server.ts` | `ensureWebPixelConnected` — uses Admin GraphQL `webPixel` query + `webPixelCreate` / `webPixelUpdate` to install / update the pixel with `{ accountID, endpointUrl }`. Self-heals settings drift. |
| `app/internal-gateway.server.ts` | Shared auth layer for backend → app calls. Verifies `X-Internal-Gateway-Secret`. Loads offline session via `unauthenticated.admin(shop)`. |
| `app/token-sync.server.ts` | `syncSessionToBackend` — POSTs offline tokens to `TOKEN_SYNC_URL` (backend `internalSync /shop-token`) with `X-Token-Sync-Secret`. |
| `app/gdpr-webhooks.server.ts` | Consolidated GDPR handler for `customers/data_request`, `customers/redact`, `shop/redact`. |
| `app/webhook-utils.server.ts` | Thin wrapper around `authenticate.webhook(request)`. |

Routes (flat-file conventions):

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/` | GET | — | Public landing |
| `/auth/*` | GET/POST | OAuth | Library-owned handshake routes |
| `/auth/login` | GET/POST | — | Manual shop entry form for direct install links |
| `/auth/callback` | GET | OAuth | Triggers `afterAuth` |
| `/app` | GET | session | Embedded shell + nav |
| `/app` (index) | GET | session | Dashboard view (shop + scopes) |
| `/app/additional` | GET | session | Setup guide page |
| `/app/coupons` | GET | session | Lists discount codes (`codeDiscountNodes`) |
| `/app/integration-status` | GET/POST | session | Status view + "Reconnect pixel" action |
| `/webhooks/app/uninstalled` | POST | Shopify HMAC | Deletes sessions for shop |
| `/webhooks/app/scopes_update` | POST | Shopify HMAC | Updates scope on sessions |
| `/webhooks/gdpr` | POST | Shopify HMAC | Dispatches to GDPR sub-handler |
| `/api/token/resolve` | POST | shared secret | Returns current offline token to backend |
| `/api/pixel/track` | POST/OPTIONS | CORS open | Pixel POSTs events; app forwards to backend |
| `/internal/shopify/coupons` | GET/PATCH | shared secret | Backend reads/updates discount codes via app session |
| `/internal/shopify/admin/graphql` | POST | shared secret | Generic Admin GraphQL pass-through |

### 2.2 Extensions

`extensions/affiliate-checkout-pixel/` — Shopify **web pixel extension**.
Compiled and installed via `webPixelCreate`. Subscribes to
`analytics.subscribe("checkout_completed", …)`. Reads cookies (`__hqref`,
`__hqsmchannel`) and POSTs a JSON envelope to `settings.endpointUrl` (the app's
`/api/pixel/track`).

`extensions/affiliate-tracking-embed/` — Shopify **theme app embed**. Liquid +
`app-embed.js`. Runs on every storefront page:
- Reads `?ref=`, `?rfname=`, `?dispc=`, `?discount=`, `?smchannel=` from URL.
- Sets first-touch cookies (`__hqref`, `__hqsmchannel`).
- Writes the same values into cart attributes via `fetch('/cart/update.js')`
  so they flow into the order as `note_attributes`.
- Shows an affiliate "gift" modal once per session.

### 2.3 Backend (`touch-backend/`)

Stack: Firebase Functions Gen 2 (`onRequest` + `onSchedule`), Express 5,
Drizzle ORM, Neon serverless Postgres, Firebase Admin for Firestore (legacy
data), Razorpay X for payouts.

Exported HTTPS functions (`functions/src/index.ts`):

| Export | URL after deploy | What it does |
|---|---|---|
| `shopifyWebhooks` | `https://shopifywebhooks-<hash>-asia-south1.a.run.app/` | New canonical Shopify dispatcher. HMAC-verifies raw body, routes by `X-Shopify-Topic`. |
| `shopifyAllInOne` | `https://shopifyallinone-dkhjjaxofq-el.a.run.app/` | Alias of `shopifyWebhooks`. Preserves the legacy URL referenced by the app's TOML so existing webhook subscriptions stay valid. |
| `pixelWebhook` | `https://pixelwebhook-<hash>-asia-south1.a.run.app/` | Receives pixel events forwarded by the app, runs affiliate attribution, UPSERTs `provisional_commissions`. |
| `internalSync` | `https://internalsync-<hash>-asia-south1.a.run.app/` | `POST /shop-token` — shared-secret upsert of `shopify_shop` row. |
| `dashboardApi` | `https://dashboardapi-<hash>-asia-south1.a.run.app/` | Creator + admin dashboard router. Not Shopify-facing. |
| `razorpayWebhook` | `https://razorpaywebhook-<hash>-asia-south1.a.run.app/` | Payout status callbacks. |
| `logRequests` | `https://logrequests-<hash>-asia-south1.a.run.app/` | Dev-debug `/log`, `/checkoutlog`. |
| `shopify` (legacy) | `https://shopify-<hash>-asia-south1.a.run.app/` | Old OAuth + uninstall router. **Gated off** by default (`ENABLE_LEGACY_SHOPIFY_OAUTH=true` to enable). Replaced by the app's OAuth flow. |
| `shopifyOrderCreated`, `shopifyOrderPaid`, `shopifyOrderCancelled`, `shopifyRefundCreated` | per-function URLs | Legacy per-topic handlers, **no HMAC verify**. Kept for backward compat. Don't subscribe new stores here. |

Scheduled functions:

| Export | Schedule | Purpose |
|---|---|---|
| `cleanupProvisionalCommissions` | `every day 20:30` UTC | Removes orphan `provisional_commissions` rows where pixel arrived but webhook never followed (or vice versa). |
| `dailyAnalyticsRollup` | `every day 20:30` UTC | Aggregates yesterday's IST data into the analytics tables. |

Topic-to-handler map inside `shopifyWebhooks`:

```
orders/create        → shopifyOrderWebhookHandler         (creates orders row, links commission)
orders/paid          → shopifyOrderPaidWebhookHandler     (paymentStatus → 'paid', ledger → 'upcoming_payment')
orders/updated       → shopifyOrderUpdatedWebhookHandler  (refresh updated_at; stub for future flows)
orders/cancelled     → shopifyOrderCancelledWebhookHandler(commission → 'void')
refunds/create       → shopifyRefundWebhookHandler        (full atomic: refunds row + order update + ledger clawback)
fulfillments/create  → shopifyFulfillmentCreatedWebhookHandler (log)
fulfillments/update  → shopifyFulfillmentUpdatedWebhookHandler (log)
```

### 2.4 Shopify

Shared dependency. Owns:

- App configuration (scopes, webhooks, application URL) declared in
  `shopify.app.toml` and pushed by `shopify app deploy`.
- OAuth grant.
- Webhook delivery with HMAC signing.
- Admin GraphQL API.
- Web pixel runtime (sandboxed JS).
- Theme app embed runtime.

---

## 3. Deployment topology

```mermaid
flowchart TB
  subgraph Cloud["Cloud Run + Firebase Functions"]
    A["shopify-affiliate<br/>React Router 7<br/>Docker, single image"]
    B1[(App Postgres<br/>DATABASE_URL)]
    F1["shopifyAllInOne / shopifyWebhooks"]
    F2["pixelWebhook"]
    F3["internalSync"]
    F4["dashboardApi"]
    F5["razorpayWebhook"]
    F6["scheduled: cleanup, analytics"]
    N[(Neon Postgres<br/>backend DATABASE_URL)]
    FS[(Firestore<br/>legacy data)]
  end

  Shopify["Shopify (Partner Dashboard,<br/>Admin, Storefront)"]
  Razorpay["Razorpay X"]
  Dash["Creator + Admin<br/>dashboards"]

  Shopify <-->|OAuth, Admin API| A
  Shopify -->|orders/* refunds/* fulfillments/*| F1
  Shopify -->|app/uninstalled, gdpr| A
  A <-->|sessions| B1
  A -->|token sync, pixel forward, internal gateway callbacks| F3
  A --> F2
  F1 --> N
  F2 --> N
  F3 --> N
  F4 --> N
  F4 --> FS
  Razorpay --> F5
  F5 --> N
  F6 --> N
  Dash --> F4
```

Each service is single-region (`asia-south1`). App scales horizontally
(stateless behind Postgres). Backend scales per function. No shared compute.

---

## 4. Database schemas

### 4.1 App DB — single table

```sql
CREATE TABLE public.shopify_app_session (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NULL,
  session_data JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX shopify_app_session_shop_idx ON public.shopify_app_session (shop);
```

That's it. The app does not persist orders, coupons, or affiliate state.

### 4.2 Backend DB — relevant tables

Defined in `functions/src/db/schema.ts`. Excerpt:

| Table | Purpose |
|---|---|
| `shopify_shop` | Cache of offline access token per shop. Populated by `internalSync /shop-token`. |
| `shopify_oauth_state` | Legacy OAuth state nonces (only relevant if `ENABLE_LEGACY_SHOPIFY_OAUTH=true`). |
| `provisional_commissions` | Handshake table keyed by `checkout_token`. Either pixel or webhook arrives first; both populate the row; status transitions `pixel_only`/`webhook_only` → `processed`. |
| `orders` | Final orders row created when both pixel and webhook converge. Holds attribution, totals, currency, payment status, refunded amount. |
| `refunds` | One row per refund webhook. Carries `commission_impact`, `refund_line_items` snapshot, raw payload. |
| `earnings_ledger` | Commission entries. Status machine: `pending_payment` → `upcoming_payment` → `paid` ; with reversals (`commission_reversal`, `deduction_pending`) for refunds. |
| `failed_webhooks` | Retry queue. Any handler exception writes here with backoff metadata. |
| `coupons`, `product_collections`, `creator_profiles`, `admin_profiles`, payout-related tables | Business data, populated by dashboards. |

---

## 5. Authentication & secrets

Three independent shared secrets cross service boundaries. Never reuse one for
another purpose.

| Secret | Set on | Sent in | Verifies |
|---|---|---|---|
| `SHOPIFY_API_SECRET` | App + Backend (must match) | `X-Shopify-Hmac-Sha256` header (Shopify → both) | That a webhook actually came from Shopify, not a forgery. Verified with `crypto.timingSafeEqual` against `crypto.createHmac('sha256', secret).update(rawBody).digest('base64')`. |
| `TOKEN_SYNC_SECRET` | App + Backend (must match) | `X-Token-Sync-Secret` header (App → Backend) | App-to-backend token-sync POSTs at `internalSync /shop-token`. |
| `INTERNAL_GATEWAY_SECRET` | App + Backend (must match) | `X-Internal-Gateway-Secret` (Backend → App) | Backend-to-app calls at `/api/token/resolve`, `/internal/shopify/*`. |

Generation:

```sh
openssl rand -hex 32   # one per secret, store in your secret manager
```

OAuth session tokens (the offline `accessToken` returned by Shopify) live in:
- **App side**: `shopify_app_session.session_data` JSONB (source of truth).
- **Backend side**: `shopify_shop.access_token` (cache, populated by token sync).

Backend can always fall back to `POST /api/token/resolve` if the cache is
stale.

---

## 6. End-to-end data flows

### 6.1 Install (or re-install) — Flow A

```mermaid
sequenceDiagram
  autonumber
  participant M as Merchant
  participant SH as Shopify Admin
  participant APP as App<br/>(shopify-affiliate)
  participant DB as App Postgres
  participant BE as Backend internalSync
  participant N as Neon (backend)
  participant SG as Shopify Admin GraphQL

  M->>SH: Click install
  SH->>APP: GET /auth?shop=<shop>
  APP->>SH: 302 to /admin/oauth/authorize
  M->>SH: Approve scopes
  SH->>APP: GET /auth/callback?code&hmac&state&host…
  APP->>APP: HMAC verify, state verify
  APP->>SH: POST /admin/oauth/access_token (code → token)
  SH-->>APP: { access_token, scope }
  APP->>DB: INSERT shopify_app_session (offline, accessToken)
  Note over APP: afterAuth hook runs

  APP->>SG: webPixel query → webPixelCreate/Update<br/>settings { accountID, endpointUrl }
  SG-->>APP: webPixel { id }

  APP->>BE: POST /shop-token<br/>X-Token-Sync-Secret<br/>{ shop, accessToken, scope, … }
  BE->>BE: timingSafeEqual on secret
  BE->>N: UPSERT shopify_shop
  BE-->>APP: 200

  APP-->>M: 302 to /app (embedded dashboard)
```

State after install:
- `shopify_app_session` row exists, `session_data.accessToken` present.
- `shopify_shop` row in Neon mirrors the access token.
- A `webPixel` exists in the shop with `endpointUrl = https://affiliateapp.saleshq.ai/api/pixel/track`.

### 6.2 Storefront affiliate link → checkout → pixel — Flow B

```mermaid
sequenceDiagram
  autonumber
  participant C as Customer
  participant SF as Storefront (theme + embed)
  participant CK as Checkout
  participant PX as Web Pixel
  participant APP as App /api/pixel/track
  participant BE as Backend pixelWebhook
  participant N as Neon

  C->>SF: Land on shop?ref=creatorCode&discount=ABC
  SF->>SF: app-embed.js sets cookies __hqref, __hqsmchannel
  SF->>SF: writes cart attributes shop_ref, affiliate_*
  SF->>SF: optionally show gift modal

  C->>CK: Complete checkout
  CK-->>PX: analytics 'checkout_completed' event

  PX->>PX: Read cookies, build envelope<br/>{ event, accountID, shop, shop_ref, sm_channel, data:event }
  PX->>APP: POST /api/pixel/track (CORS)
  APP->>APP: Validate body.event present
  APP-->>PX: 200 (CORS headers)
  APP->>BE: POST PIXEL_FORWARD_URL (fire-and-forget)
  BE->>BE: Extract checkout_token, referral, coupon
  BE->>BE: resolveAffiliateId(referralCode, couponCode)
  BE->>N: INSERT provisional_commissions ON CONFLICT UPDATE
  Note over N: status: 'pixel_only' or 'processed'<br/>(if webhook already arrived)
```

If the customer arrives by an affiliate link but the **theme embed** isn't
installed, the pixel still fires — it just won't carry the
`shop_ref` cookie. Resolution then depends on `affiliate_discount_code`
matching a coupon in `coupons`.

### 6.3 Shopify order webhook → backend — Flow C

```mermaid
sequenceDiagram
  autonumber
  participant SH as Shopify
  participant DSP as shopifyAllInOne (Express)
  participant H as Topic handler
  participant N as Neon

  SH->>DSP: POST / with X-Shopify-Topic,<br/>X-Shopify-Shop-Domain,<br/>X-Shopify-Hmac-Sha256
  DSP->>DSP: express.raw() captures bytes
  DSP->>DSP: verifyShopifyHmac(rawBody, header, SHOPIFY_API_SECRET)
  alt HMAC mismatch
    DSP-->>SH: 401 Invalid HMAC
  else HMAC valid
    DSP->>DSP: JSON.parse
    DSP->>DSP: lookup TOPIC_HANDLERS[topic]
    DSP->>H: handler(req, res) with parsed body
    H->>N: business writes (provisional_commissions, orders, refunds, earnings_ledger)
    alt success
      H-->>SH: 200 status:ok
    else exception
      H->>N: INSERT failed_webhooks (retry payload)
      H-->>SH: 200 status:error_logged (no retry storm)
    end
  end
```

Handler-specific behavior:

| Topic | Side effect |
|---|---|
| `orders/create` | UPSERT `provisional_commissions` by `checkout_token`. If pixel side already populated `affiliate_id`, transition to `processed`, create `orders` + `earnings_ledger` rows. |
| `orders/paid` | Find order by Shopify ID, set `payment_status='paid'`, ledger `status='upcoming_payment'`. |
| `orders/updated` | Touch `orders.updated_at`. Hook for future logic (line edits, status transitions). |
| `orders/cancelled` | Set ledger `status='void'`. |
| `refunds/create` | Atomic: idempotency check by `shopify_refund_id`, insert `refunds` row, update `orders.refunded_amount` + `payment_status`, calculate proportional commission impact, either negate the existing ledger entry (`partially_voided` / `void`) or write a `commission_reversal` entry if commission was already paid. |
| `fulfillments/create`, `fulfillments/update` | Log only (current behavior). |

### 6.4 Backend needs to call Shopify Admin API — Flow D

```mermaid
sequenceDiagram
  autonumber
  participant BE as Backend code
  participant APP as App internal gateway
  participant DB as App session storage
  participant SG as Shopify Admin GraphQL

  BE->>APP: POST /internal/shopify/admin/graphql<br/>X-Internal-Gateway-Secret<br/>{ shop, query, variables }
  APP->>APP: timingSafeEqual on secret
  APP->>APP: unauthenticated.admin(shop)
  APP->>DB: SELECT session by shop
  DB-->>APP: { accessToken, scope, … }
  APP->>SG: admin.graphql(query, { variables })
  SG-->>APP: { data, errors }
  APP-->>BE: { ok, shop, data, errors }
```

Token-only variant:
```
POST /api/token/resolve  + X-Internal-Gateway-Secret + { shop }
→ { ok, shop, accessToken, scope, accessTokenExpiresAtMs, refreshTokenExpiresAtMs }
```
Backend can then call Shopify directly. Useful when backend needs raw control
over the request shape (rate limiting, retries, bulk queries).

### 6.5 Uninstall — Flow E

```mermaid
sequenceDiagram
  autonumber
  participant SH as Shopify
  participant APP as App /webhooks/app/uninstalled
  participant DB as App Postgres
  participant BE as Backend (any future caller)
  participant N as Neon

  SH->>APP: POST app/uninstalled + HMAC
  APP->>APP: authenticate.webhook → HMAC verify
  APP->>DB: SELECT sessions WHERE shop=
  APP->>DB: DELETE sessions
  APP-->>SH: 200

  Note over N: shopify_shop row not touched here.
  BE-->>APP: Later: POST /api/token/resolve { shop }
  APP-->>BE: 404 No valid offline session
  BE->>N: (optional) mark shop uninstalled
```

The backend isn't told directly. Backend learns about the uninstall lazily when
`/api/token/resolve` returns 404. If you need an explicit signal, extend
`token-sync.server.ts` to POST a `{ uninstalled: true }` event on the same
endpoint.

### 6.6 Scopes update — Flow E2

```mermaid
sequenceDiagram
  autonumber
  participant SH as Shopify
  participant APP as App /webhooks/app/scopes_update
  participant DB as App Postgres

  SH->>APP: POST app/scopes_update + HMAC + { current: [...] }
  APP->>APP: HMAC verify
  APP->>DB: For each session in shop:<br/>update session.scope, storeSession()
  Note over DB: storeSession also re-fires<br/>syncSessionToBackend → /shop-token<br/>so backend learns new scope
  APP-->>SH: 200
```

### 6.7 GDPR compliance — Flow F

```mermaid
sequenceDiagram
  autonumber
  participant SH as Shopify
  participant APP as App /webhooks/gdpr
  participant DB as App Postgres

  SH->>APP: POST customers/data_request | customers/redact | shop/redact + HMAC
  APP->>APP: authenticate.webhook → HMAC verify
  APP->>APP: switch(topic)
  alt customers/data_request
    APP->>APP: log customer id (forward to data team manually)
  else customers/redact
    APP->>APP: log redaction request (no PII stored in app DB)
  else shop/redact
    APP->>DB: DELETE all sessions for shop
  end
  APP-->>SH: 200
```

The app does **not** store customer PII, so customer redact is mostly a no-op
plus audit logging. Backend stores PII (emails, possibly addresses in `orders`)
— compliance team is responsible for redacting those if a redact request
arrives. Hook this into `customers/redact` if/when needed.

### 6.8 Offline token refresh — Flow G

When the offline token expires (`future.expiringOfflineAccessTokens: true`),
`@shopify/shopify-app-react-router` automatically refreshes:

```mermaid
sequenceDiagram
  autonumber
  participant L as Loader / Action
  participant LIB as shopify-app-react-router
  participant SH as Shopify OAuth
  participant DB as App Postgres
  participant BE as Backend internalSync

  L->>LIB: authenticate.admin(request)
  LIB->>DB: loadSession
  alt session expired
    LIB->>SH: POST /access_token (refresh)
    SH-->>LIB: new accessToken + refreshToken
    LIB->>DB: storeSession (offline)
    DB->>BE: forwardRefreshedOfflineToken → POST /shop-token
  end
  LIB-->>L: session + admin client
```

---

## 7. Configuration reference

### 7.1 Shopify app TOML — `shopify.app.toml`

```toml
client_id = "df526699c22e3167ba9a24e0ea5e42ba"
name = "Affiliate-Saleshq"
application_url = "https://affiliateapp.saleshq.ai"
embedded = true

[webhooks]
api_version = "2025-10"

# Lifecycle — stay local
[[webhooks.subscriptions]]
topics = [ "app/uninstalled" ]
uri = "/webhooks/app/uninstalled"

[[webhooks.subscriptions]]
topics = [ "app/scopes_update" ]
uri = "/webhooks/app/scopes_update"

# Compliance — stay local
[[webhooks.subscriptions]]
compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
uri = "/webhooks/gdpr"

# Domain events — direct to backend
[[webhooks.subscriptions]]
topics = [
  "orders/create", "orders/paid", "orders/updated", "orders/cancelled",
  "refunds/create", "fulfillments/create", "fulfillments/update",
]
uri = "https://shopifyallinone-dkhjjaxofq-el.a.run.app/"

[access_scopes]
scopes = "read_fulfillments,read_orders,write_products,write_discounts,read_discounts,write_price_rules,read_price_rules,write_pixels,read_customer_events"

[auth]
redirect_urls = [ "https://affiliateapp.saleshq.ai/auth/callback" ]

[capabilities]
customer_events = true
```

### 7.2 Environment variables

**Shopify app side** (set in hosting env, e.g. Cloud Run env or Docker `-e`):

| Var | Required | Points to / value |
|---|---|---|
| `SHOPIFY_API_KEY` | yes | App client ID (`df526699c22e3167ba9a24e0ea5e42ba`). |
| `SHOPIFY_API_SECRET` | yes | App client secret. Used to verify Shopify HMAC on local webhooks. |
| `SHOPIFY_APP_URL` | yes | `https://affiliateapp.saleshq.ai`. Defines OAuth redirect base + pixel default endpoint. |
| `DATABASE_URL` | yes (prod) | App's Postgres connection string. |
| `SCOPES` | no | Override scopes CSV. Leave unset — hardcoded list is canonical. |
| `INTERNAL_GATEWAY_SECRET` | yes | Shared secret for backend → app calls. |
| `TOKEN_SYNC_URL` | yes | `https://internalsync-<hash>-asia-south1.a.run.app/shop-token`. |
| `TOKEN_SYNC_SECRET` | yes | Shared secret for app → backend `/shop-token` calls. |
| `PIXEL_FORWARD_URL` | yes | `https://pixelwebhook-<hash>-asia-south1.a.run.app`. |
| `PIXEL_ENDPOINT_URL` | no | Override pixel target. Default = `${SHOPIFY_APP_URL}/api/pixel/track`. |
| `PIXEL_ACCOUNT_ID` | no | Override pixel `accountID`. Default = `session.shop`. |
| `SHOP_CUSTOM_DOMAIN` | no | Extra `*.myshopify.com` variant for dev stores. |
| `NODE_ENV` | yes (prod) | `production` |

**Backend side** (`touch-backend/functions/.env`):

| Var | Required | Value |
|---|---|---|
| `SHOPIFY_API_SECRET` | yes | Same value as app's. Used by `shopifyWebhooks` for HMAC. |
| `TOKEN_SYNC_SECRET` | yes | Same value as app's. Used by `internalSync`. |
| `DATABASE_URL` | yes | Neon connection string. |
| `ENABLE_LEGACY_SHOPIFY_OAUTH` | no | `true` only if old install flow is still in use. Default off. |
| `SHOPIFY_API_KEY` | conditional | Only if `ENABLE_LEGACY_SHOPIFY_OAUTH=true`. |
| `SHOPIFY_SCOPES` | conditional | Only if legacy OAuth enabled. |
| `APP_URL` | conditional | Only if legacy OAuth enabled. |
| `FB_API_KEY`, `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, … | yes (existing) | Pre-existing single-store admin creds + Firebase web key. Independent of the multi-tenant Shopify-app flow. |
| Razorpay creds | yes (existing) | Payout integration. |

---

## 8. Failure modes & retry behavior

| Failure | Detection | Response |
|---|---|---|
| Shopify webhook HMAC mismatch | `shopifyWebhooks` rejects with 401 | Shopify retries with exponential backoff up to 48 hours. If it's a real signature problem, check `SHOPIFY_API_SECRET` parity. |
| Handler exception inside dispatcher | `try/catch` in router + per-handler `failed_webhooks` insert | Handler returns 200 to Shopify (no retry). Row in `failed_webhooks` carries raw payload + error + `next_retry_at`. Manual or scheduled retry processes it later. |
| Pixel event arrives before order webhook | UPSERT in `provisional_commissions` | `status='pixel_only'`. Order webhook later transitions to `processed`. |
| Order webhook arrives before pixel | UPSERT in `provisional_commissions` | `status='webhook_only'`. Pixel event later transitions to `processed`. |
| Neither pixel nor webhook converges | Cron `cleanupProvisionalCommissions` | Daily at 20:30 UTC, removes orphan rows past TTL. |
| App ↔ backend token sync 5xx | App logs and continues | Backend can still call `/api/token/resolve` to fetch fresh token on demand. Cache is best-effort. |
| Offline token expired | `expiringOfflineAccessTokens: true` triggers refresh inside loader | New token persisted, then re-synced to backend via `storeSession` → `forwardRefreshedOfflineToken`. |
| Backend → app gateway 5xx | Backend logs, fails task | No retry layer here today. Add one if it becomes a hot path. |

---

## 9. Local dev

Both services need their own Postgres. Backend uses Neon; for local dev use
the Neon proxy or run a local pg. App uses any Postgres; defaults to
`postgresql://postgres:postgres@localhost:5432/postgres` if `DATABASE_URL` is
unset.

```sh
# App
cd shopify-affiliate
npm install
npm run dev       # uses shopify.app.toml + Shopify CLI tunnel

# Backend
cd touch-backend/functions
npm install
npm run serve     # firebase emulators
```

Trigger webhooks locally:

```sh
shopify webhook trigger orders/create \
  --address https://<your-dispatcher-tunnel-or-deployed-url>/ \
  --shared-secret "$SHOPIFY_API_SECRET"
```

---

## 10. Deploy checklist

1. **Backend**
   - Set `SHOPIFY_API_SECRET`, `TOKEN_SYNC_SECRET`, `DATABASE_URL` in `functions/.env` or Firebase secrets.
   - `cd touch-backend/functions && npm run deploy`
   - Confirm URLs: `firebase functions:list`
   - Note URLs for `shopifyAllInOne` (must equal `https://shopifyallinone-dkhjjaxofq-el.a.run.app` to keep legacy compatible), `pixelWebhook`, `internalSync`.

2. **App env**
   - Set `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, `DATABASE_URL`.
   - Set `INTERNAL_GATEWAY_SECRET`, `TOKEN_SYNC_SECRET` (must match backend).
   - Set `TOKEN_SYNC_URL` to the deployed `internalSync` URL + `/shop-token`.
   - Set `PIXEL_FORWARD_URL` to the deployed `pixelWebhook` URL.

3. **App deploy**
   - `cd shopify-affiliate`
   - `npm run build`
   - Deploy Docker image to Cloud Run / your host.
   - `npm run deploy` — pushes TOML + extension manifests to Shopify Partner Dashboard.

4. **Smoke test**
   - Install / reinstall the app on a dev store.
   - Verify `shopify_app_session` row exists.
   - Verify `shopify_shop` row exists in Neon (token sync worked).
   - Trigger `shopify webhook trigger orders/create …` — confirm 200 + a row in `provisional_commissions`.
   - Place a test order with an affiliate link, watch pixel event flow into `provisional_commissions` and converge with the webhook.

---

## 11. Frequently surprising bits

| Surprise | Why |
|---|---|
| The app has its own DB. | Shopify session storage requires durable, multi-instance-safe persistence. Backend Neon could be reused as a separate DB, but logical isolation is worth keeping. See `README.md` §"Session storage". |
| `shopifyAllInOne` and `shopifyWebhooks` are the same function. | Alias preserves the legacy URL used by the app's TOML. Once all stores are migrated, `shopifyAllInOne` can be removed. |
| Per-topic legacy exports (`shopifyOrderCreated`, …) don't verify HMAC. | They predate the dispatcher. New stores must NOT subscribe to them; the alias above is the migration path. |
| Backend has an OAuth flow too. | Legacy. Gated behind `ENABLE_LEGACY_SHOPIFY_OAUTH=true`. The app is the canonical OAuth surface. |
| Pixel cookies are first-touch only. | The theme embed deliberately skips overwrite if `shop_ref` already exists in cart attributes, so the first affiliate wins. |
| `provisional_commissions` may be created with status `webhook_only` and never converge. | If the pixel was blocked by adblock or the theme embed wasn't installed. Daily cleanup removes orphans. |
| The app's `/internal/shopify/admin/graphql` is a thin proxy. | Lets the backend run *any* Admin GraphQL without storing tokens itself — useful for one-off operations without code changes. |

---

## 12. Glossary

- **Offline access token** — long-lived Shopify token granted at install. Lives in `shopify_app_session.session_data.accessToken`. Refreshes automatically when `future.expiringOfflineAccessTokens` is enabled.
- **Online session** — short-lived per-user token. Used by the embedded admin UI. Not persisted to backend.
- **HMAC** — `crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(rawBody).digest('base64')`. Compared with `crypto.timingSafeEqual`.
- **App-specific webhook** — declared in TOML, managed by Shopify. Survives reinstalls without manual registration.
- **Web pixel** — JS sandbox installed into the storefront. Cannot read arbitrary DOM but receives `analytics.subscribe(...)` events with full checkout context.
- **Theme app embed** — Liquid block + script loaded on every storefront page. Has full storefront JS access (cookies, fetch).
- **Provisional commission** — handshake row. Either side (pixel, webhook) may arrive first; both populate the same `checkout_token` keyed row.
- **Earnings ledger** — append-mostly journal of commission events: `pending_payment`, `upcoming_payment`, `paid`, `void`, `partially_voided`, `commission_reversal`, `deduction_pending`.
