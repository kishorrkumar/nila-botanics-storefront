# Nila Botanics storefront + order admin

This repository contains two deployable applications:

- `src/` — Next.js storefront deployed on Vercel.
- `backend/` — Express order API and protected admin dashboard deployed on Render.

Customers can add products, enter delivery details, and place a test order using any four-digit demo authorization code. No real payment is collected and the code is never stored. Orders appear in the Render admin dashboard, where the team can manage fulfilment and initiate a SnapServe delivery call.

## Architecture

```text
Customer → Vercel storefront → Render order API → PostgreSQL
                                  │
Admin → Render /admin ────────────┤
                                  └→ SnapServe MCP process → delivery call
```

## Local setup

Requirements: Node.js 20.9 or newer, npm and an optional PostgreSQL database.

### Storefront

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use this `.env.local` and open `http://localhost:3000`:

```env
NEXT_PUBLIC_ADMIN_API_URL=http://localhost:4000
ADMIN_API_URL=http://localhost:4000
```

### Admin API

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:4000/admin`. Without `DATABASE_URL`, development orders use temporary memory and disappear after a restart.

## Vercel frontend deployment

Import this repository in Vercel and keep the Root Directory empty. Add:

```env
NEXT_PUBLIC_ADMIN_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
ADMIN_API_URL=https://YOUR-RENDER-SERVICE.onrender.com
```

Redeploy after changing either value.

## Render backend deployment

The included `render.yaml` can create the service. For manual setup use:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check | `/api/health` |

Add these Render environment variables:

```env
FRONTEND_ORIGIN=https://YOUR-VERCEL-SITE.vercel.app
DATABASE_URL=YOUR_POSTGRES_CONNECTION_STRING
ADMIN_USERNAME=admin
ADMIN_PASSWORD=USE_A_STRONG_PASSWORD
```

The admin dashboard is `https://YOUR-RENDER-SERVICE.onrender.com/admin`. `FRONTEND_ORIGIN` accepts comma-separated URLs if you also use a custom domain.

## PostgreSQL

The backend creates the `orders` table on startup. Use Render Postgres, Neon, Supabase or another PostgreSQL provider. The database stores delivery information, items, totals, fulfilment status and call status. The four-digit demo code is validated and immediately discarded.

## SnapServe delivery-call configuration

Keep every SnapServe secret only in Render. Two calling modes are supported.

### Recommended: campaign website intake

Create an active SnapServe campaign with **Website form** as the lead source. Map `phone`, `name`, `order_id`, `order_total`, `delivery_address`, and `items` to your agent variables, then set the returned form webhook URL:

```env
SNAPSERVE_CAMPAIGN_WEBHOOK_URL=https://api.snapserve.ai/api/webhooks/lead/YOUR_TOKEN
SNAPSERVE_CAMPAIGN_WEBHOOK_TOKEN=
AUTO_CALL_ON_ORDER=false
```

This mode lets the delivery agent use the submitted order fields. Activate the campaign in SnapServe before enabling automatic calls.

### Direct API mode

```env
SNAPSERVE_API_KEY=YOUR_REAL_SERVER_SIDE_KEY
SNAPSERVE_BASE_URL=https://api.snapserve.ai/api
SNAPSERVE_AGENT_ID=YOUR_DELIVERY_AGENT_ID
AUTO_CALL_ON_ORDER=false
```

Direct calls use SnapServe's documented `POST /calls/outbound` endpoint. It accepts `agentId` and `toNumber`; it does not accept per-call variables, so campaign intake is better for personalized order calls.

### Call-result webhook

Register this Render endpoint for `call.completed` and `call.failed`:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/webhooks/snapserve
```

Save the endpoint secret once and add it to Render:

```env
SNAPSERVE_WEBHOOK_SECRET=YOUR_ENDPOINT_SECRET
```

The backend verifies `X-SnapServe-Signature`, then stores call status, duration, cost, summary, disposition, transcript, and recording URL in Neon.

Important:

- Never expose `SNAPSERVE_API_KEY` in frontend code or a `NEXT_PUBLIC_*` variable.
- Keep `AUTO_CALL_ON_ORDER=false` while testing and use **Call customer** manually.
- After a successful test, set `AUTO_CALL_ON_ORDER=true` for automatic calls.
- Calls are available only when the customer checks the automated-call consent box.

## API endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/orders` | Public storefront | Create demo-authorized order |
| `POST` | `/api/orders/status` | Order ID + phone | Order lookup |
| `GET` | `/api/admin/orders` | Admin | List orders |
| `PATCH` | `/api/admin/orders/:id` | Admin | Update fulfilment status |
| `POST` | `/api/admin/orders/:id/call` | Admin | Initiate delivery call |
| `POST` | `/api/admin/orders/:id/call/refresh` | Admin | Refresh direct-call result |
| `GET` | `/api/admin/snapserve` | Admin | Integration status |
| `POST` | `/api/webhooks/snapserve` | Signed SnapServe | Store call result |
| `GET` | `/api/health` | Public | Render health check |

## Production notes

- This is a demo authorization, not a payment gateway. Do not present it as real payment.
- Add Razorpay, Stripe or another compliant provider before accepting money.
- Use strong admin credentials and HTTPS production URLs.
- Delivery data is sensitive; restrict database and admin access.
- Add rate limiting before a high-volume public launch.
- Obtain explicit consent for automated voice calls and follow applicable telecom/privacy rules.
- Replace demonstration photography with licensed brand-owned assets.
