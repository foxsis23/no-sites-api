# no-sites-api

Multitenant backend serving multiple health/medical sites from a single Node.js process.
Each site is identified by its domain via the `Host` / `x-forwarded-host` header.

## Stack

- **Node.js** + **TypeScript**
- **Fastify** (v4) with pino logger
- **Prisma ORM** + **PostgreSQL**
- **PM2** for process management
- **WayForPay** payment gateway

---

## Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14
- PM2 (`npm install -g pm2`)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/nosites"
WFP_MERCHANT_ACCOUNT="your_merchant_account"
WFP_MERCHANT_KEY="your_merchant_secret_key"
PORT=3000
```

### 3. Run database migration

```bash
npx prisma migrate deploy
```

For development (creates migration files):

```bash
npx prisma migrate dev --name init
```

### 4. Generate Prisma client

```bash
npx prisma generate
```

### 5. Start development server

```bash
npm run dev
```

### 6. Build and start production

```bash
npm run build
pm2 start ecosystem.config.js --env production
```

---

## Adding a New Site

Insert directly via SQL:

```sql
INSERT INTO "Site" (id, domain, name, settings, "createdAt")
VALUES (
  gen_random_uuid(),
  'yourdomain.com',
  'Site Display Name',
  '{"adminKey": "your-strong-random-key", "merchantDomain": "yourdomain.com"}'::jsonb,
  NOW()
);
```

Or via Prisma Studio:

```bash
npx prisma studio
```

### Site `settings` JSON fields

| Field | Required | Description |
|-------|----------|-------------|
| `adminKey` | Yes | Secret key for admin endpoints (passed via `x-admin-key` header) |
| `merchantDomain` | No | Domain sent to WayForPay (defaults to site domain if omitted) |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `WFP_MERCHANT_ACCOUNT` | Yes | — | WayForPay merchant account name |
| `WFP_MERCHANT_KEY` | Yes | — | WayForPay HMAC-MD5 secret key |
| `PORT` | No | `3000` | Server listen port |

---

## API Endpoints

All responses use the envelope format:
- **Success**: `{ "success": true, "data": ... }`
- **Error**: `{ "success": false, "error": "message" }`

Every request (except `/health` and `/payments/webhook`) requires a `Host` header matching a registered site domain.

Admin endpoints additionally require the `x-admin-key` header.

---

### Health

#### `GET /health`

```bash
curl http://localhost:3000/health
```

Response:
```json
{ "status": "ok", "timestamp": "2024-01-01T00:00:00.000Z" }
```

---

### Products

#### `GET /products` — List active products

```bash
curl -H "Host: yourdomain.com" http://localhost:3000/products
```

#### `GET /products/:id` — Get single product

```bash
curl -H "Host: yourdomain.com" http://localhost:3000/products/PRODUCT_UUID
```

#### `POST /products` — Create product (admin)

```bash
curl -X POST \
  -H "Host: yourdomain.com" \
  -H "x-admin-key: your-strong-random-key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hair Loss Guide",
    "description": "Detailed explanation of your hair loss type",
    "price": "29.00",
    "order": 1
  }' \
  http://localhost:3000/products
```

#### `PATCH /products/:id` — Update product (admin)

```bash
curl -X PATCH \
  -H "Host: yourdomain.com" \
  -H "x-admin-key: your-strong-random-key" \
  -H "Content-Type: application/json" \
  -d '{ "price": "39.00", "isActive": true }' \
  http://localhost:3000/products/PRODUCT_UUID
```

#### `DELETE /products/:id` — Soft delete product (admin)

```bash
curl -X DELETE \
  -H "Host: yourdomain.com" \
  -H "x-admin-key: your-strong-random-key" \
  http://localhost:3000/products/PRODUCT_UUID
```

---

### Payments

#### `POST /payments/create` — Create WayForPay payment

```bash
curl -X POST \
  -H "Host: yourdomain.com" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PRODUCT_UUID",
    "customerEmail": "user@example.com",
    "customerName": "John Doe",
    "customerPhone": "+380991234567"
  }' \
  http://localhost:3000/payments/create
```

Response includes `formData` — post these fields to `https://secure.wayforpay.com/pay` to redirect the user to the payment page.

#### `POST /payments/webhook` — WayForPay callback (called by WayForPay servers)

Configure this URL in your WayForPay merchant settings:
```
https://api.yourdomain.com/payments/webhook
```

WayForPay will POST order status updates here. The endpoint verifies the HMAC-MD5 signature and updates the order status (`PENDING` → `PAID` or `FAILED`).

#### `GET /payments/orders` — List orders (admin)

```bash
curl \
  -H "Host: yourdomain.com" \
  -H "x-admin-key: your-strong-random-key" \
  http://localhost:3000/payments/orders
```

---

### Analytics

#### `POST /analytics/event` — Track event

```bash
curl -X POST \
  -H "Host: yourdomain.com" \
  -H "Content-Type: application/json" \
  -d '{ "event": "page_view", "metadata": { "page": "/", "referrer": "google.com" } }' \
  http://localhost:3000/analytics/event
```

Common events: `page_view`, `start_test`, `complete_test`, `result_view`, `payment_success`, `payment_fail`, `open_delivery`

#### `GET /analytics/summary` — Event summary (admin)

```bash
curl \
  -H "Host: yourdomain.com" \
  -H "x-admin-key: your-strong-random-key" \
  "http://localhost:3000/analytics/summary?days=30"
```

Response:
```json
{
  "success": true,
  "data": [
    { "event": "page_view", "count": 1523 },
    { "event": "start_test", "count": 847 },
    { "event": "payment_success", "count": 134 }
  ]
}
```

---

## PM2 Commands

```bash
# Start in production
pm2 start ecosystem.config.js --env production

# View status
pm2 status

# View logs
pm2 logs no-sites-api

# Restart
pm2 restart no-sites-api

# Stop
pm2 stop no-sites-api

# Save process list (auto-start on reboot)
pm2 save
pm2 startup
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| All endpoints | 100 req/min |
| `POST /payments/create` | 10 req/min |

---

## Architecture

```
request → resolveSite (lookup by Host header, cached 60s) → route handler
                                                          → adminAuth (if admin route)
```

- **Site cache**: In-memory TTL map (60s). Survives between requests, resets on restart.
- **Multitenancy**: All queries are scoped by `siteId` — data is fully isolated between sites.
- **Money**: Stored as `DECIMAL(10,2)` in PostgreSQL. Never floating-point.
- **Webhooks**: Idempotent — duplicate WayForPay callbacks are silently accepted.
