# Hutko Payment Integration — Design

**Date:** 2026-07-16
**Site:** тривога-нет — prod `https://www.xn--80adds5ajn.net/` (punycode for `тривога.net`), multitenant backend `no-sites-api`
**Status:** Approved for planning

## Goal

Add Hutko as a third payment provider alongside the existing WayForPay and LiqPay
integrations. Hutko uses a hosted-checkout (redirect) flow: the backend creates an
order in Hutko, receives a `checkout_url`, and the frontend redirects the customer to
Hutko's payment page. Hutko then delivers payment status via a signed server callback
(webhook). All credentials live on the backend in environment variables.

This is additive — WayForPay and LiqPay endpoints are untouched. The frontend chooses
which provider endpoint to call.

## Hutko API Contract (verified against official `hutko-service/node-js-sdk`)

- **Endpoint:** `POST https://pay.hutko.org/api/checkout/url/`
- **Request body:** JSON `{ "request": { ...params, "signature": "<sha1hex>" } }`
- **Signature (protocol 1.0):**
  `sha1( secretKey + "|" + <values of non-empty params, keys sorted alphabetically,
  excluding "signature" and "response_signature_string", joined by "|"> )` → lowercase hex
- **Amount:** integer **kopiykas** as a string. `10.00 UAH → "1000"` (price × 100, rounded).
- **Success response:** `{ "response": { "checkout_url": "https://...", ... } }`
- **Error response:** `{ "response": { "error_code": N, "error_message": "...", "request_id": "..." } }`
- **Server callback:** JSON POST to `server_callback_url`. Contains at minimum
  `order_id`, `merchant_id`, `order_status`, `amount`, `currency`, `signature`.
  `order_status` values: `approved`, `declined`, `expired`, `processing`, `reversed`.
  Verify by recomputing the same signature over the callback body (excluding `signature`
  and `response_signature_string`) and comparing to the received `signature`.

## Design Decisions

1. **Hand-rolled provider module**, not the SDK. The SDK is CommonJS, untyped, and uses
   `Math.random` for order ids. The codebase hand-rolls WayForPay/LiqPay as small typed
   pure modules; Hutko follows the same pattern. The signature algorithm is copied
   verbatim from the SDK's `genSignature`.
2. **`server_callback_url`** built from a new `API_BASE_URL` env var (stable, independent
   of proxy headers): `${API_BASE_URL}/payments/hutko-callback`.
3. **`response_url`** (browser return after payment) taken from
   `site.settings.paymentReturnUrl`, defaulting to `https://${site.domain}`. For prod
   тривога-нет this resolves to `https://www.xn--80adds5ajn.net/`. Confirm the DB
   `Site.domain` value matches (punycode `www.xn--80adds5ajn.net`), otherwise set
   `site.settings.paymentReturnUrl` explicitly.
4. **On successful payment**, replicate existing behavior: mark Order `PAID` and call
   `createSessionInternal(prisma, siteId, customerEmail)` to grant magic access.
5. **Order lookup by `order_id`**, which we set equal to our `order.id` (same approach as
   WayForPay's `orderReference`).

## Components

### 1. Schema change (`prisma/schema.prisma`)

Add nullable JSON column to `Order`, mirroring the existing provider columns:

```prisma
hutkoData Json?
```

Generate a Prisma migration.

### 2. `src/modules/payments/hutko.ts` (new, pure module)

Types:
- `HutkoCheckoutParams` — `{ merchantId, orderId, amountKopiykas, currency, orderDesc, responseUrl, serverCallbackUrl }`
- `HutkoCallbackBody` — `{ order_id, merchant_id, order_status, amount, currency, signature, [key]: unknown }`

Functions:
- `genSignature(params: Record<string, unknown>, secret: string): string`
  Sort keys, drop empty values and the `signature` / `response_signature_string` keys,
  join values with `|`, prepend `secret + "|"`, `sha1` → hex.
- `buildCheckoutRequest(params: HutkoCheckoutParams, secret: string): Record<string, string>`
  Builds the flat request object (`merchant_id`, `order_id`, `order_desc`, `currency`,
  `amount`, `response_url`, `server_callback_url`) and appends `signature`.
- `requestCheckoutUrl(request: Record<string, string>): Promise<string>`
  `fetch('https://pay.hutko.org/api/checkout/url/', { method: 'POST', headers: JSON,
  body: JSON.stringify({ request }) })`. Parse `response`. Throw `AppError(502, ...)` on
  `error_code` or missing `checkout_url`. Returns `checkout_url`.
- `verifyCallbackSignature(body: HutkoCallbackBody, secret: string): boolean`
  Recompute `genSignature(body, secret)`, compare to `body.signature`.

### 3. `src/modules/payments/payments.service.ts` (extend)

- `createHutkoPayment(prisma, site, hutkoConfig, apiBaseUrl, body): Promise<{ orderId, checkoutUrl }>`
  1. Validate product (reuse existing checks: exists, belongs to site, active).
  2. Create Order `PENDING`.
  3. `amountKopiykas = Math.round(Number(product.price) * 100).toString()`.
  4. `responseUrl = site.settings.paymentReturnUrl ?? \`https://${site.domain}\``.
  5. `serverCallbackUrl = \`${apiBaseUrl}/payments/hutko-callback\``.
  6. `buildCheckoutRequest(...)` → `requestCheckoutUrl(...)`.
  7. Return `{ orderId: order.id, checkoutUrl }`.
- `handleHutkoCallback(prisma, secret, body): Promise<void>`
  1. `verifyCallbackSignature` — else `AppError(400, 'Invalid Hutko signature')`.
  2. Find Order by `id = body.order_id`. If missing, return (accept, no retry storm).
  3. Idempotency: only act if `status === 'PENDING'`.
  4. Map `order_status`: `approved` → `PAID`; `declined` / `expired` / `reversed` →
     `FAILED`; `processing` (or any other intermediate) → no status change, return early
     (leave `PENDING`, wait for a terminal callback). Store `hutkoData = body` on terminal
     statuses only.
  5. If `PAID`: `createSessionInternal(prisma, order.siteId, order.customerEmail)`.

### 4. `src/modules/payments/payments.route.ts` (extend)

- `POST /payments/hutko/create` — `preHandler: [resolveSite]`, `rateLimit: 10/min`,
  `schema: createPaymentSchema` (same body as WFP: `productId`, `customerEmail`,
  `customerName`, `customerPhone`). Returns `201 { success: true, data: { checkoutUrl, orderId } }`.
- `POST /payments/hutko-callback` — `schema: hutkoCallbackSchema` (loose object,
  `additionalProperties` allowed). Calls `handleHutkoCallback`, returns
  `200 { success: true }`. Body is JSON — the default Fastify JSON parser handles it.

### 5. `src/modules/payments/payments.schema.ts` (extend)

- `hutkoCallbackSchema` — loose object requiring `order_id`, `order_status`, `signature`;
  allows additional properties (Hutko sends many fields).

### 6. `src/config.ts` (extend)

```ts
hutko: {
  merchantId: requireEnv('HUTKO_MERCHANT_ID'),
  secretKey: requireEnv('HUTKO_SECRET_KEY'),
},
apiBaseUrl: requireEnv('API_BASE_URL'),
```

### 7. `.env.example` (extend)

```
# Hutko credentials
HUTKO_MERCHANT_ID="your_hutko_merchant_id"
HUTKO_SECRET_KEY="your_hutko_secret_key"

# Public base URL of this API (used for Hutko server callback)
API_BASE_URL="https://api.example.com"
```

## Data Flow

```
Frontend --POST /payments/hutko/create--> API
  API: validate product, create Order(PENDING), sign request
  API --POST /api/checkout/url/--> Hutko  ==> { checkout_url }
  API --201 { checkoutUrl }--> Frontend
Frontend: window.location = checkoutUrl
Customer pays on Hutko page
Hutko --POST /payments/hutko-callback--> API
  API: verify signature, find Order, set PAID/FAILED (idempotent), create Session on PAID
  API --200 { success: true }--> Hutko
Customer redirected to response_url (site page)
```

## Error Handling

- Invalid callback signature → `AppError(400)`.
- Unknown `order_id` in callback → return 200 without side effects (avoid retry storms),
  matching the WayForPay handler.
- Hutko API error / missing `checkout_url` → `AppError(502, 'Hutko checkout failed')`.
- Product not found / inactive → `AppError(404 / 400)` (existing helpers).
- Callback processed only when Order is `PENDING` (idempotent against duplicate callbacks).

## Testing (vitest)

**Unit — `hutko.ts`:**
- `genSignature` against a known fixed input/secret → expected hex (lock the algorithm).
- `buildCheckoutRequest` includes all params + a valid `signature`; empty fields excluded.
- `verifyCallbackSignature` true for a correctly-signed body, false when tampered.

**Service — `createHutkoPayment` / `handleHutkoCallback`:**
- Mocked `prisma` + mocked global `fetch`.
- `createHutkoPayment`: creates PENDING Order, returns `checkoutUrl` from mocked response;
  throws on inactive/foreign product; throws `AppError(502)` on Hutko error response.
- `handleHutkoCallback`: bad signature throws; `approved` → PAID + session created;
  `declined` → FAILED, no session; `processing` leaves Order PENDING (no change);
  already-`PAID` order is left unchanged (idempotent); unknown `order_id` is a no-op.

Target: 80%+ coverage on the new module and service functions.

## Out of Scope (YAGNI)

- Refunds / reversals (`Reverse`), status polling, recurring/subscriptions, tokenized
  card flows. Not needed for the redirect checkout.
- Removing or altering WayForPay / LiqPay.
- Frontend changes (separate concern; this is the backend API).
