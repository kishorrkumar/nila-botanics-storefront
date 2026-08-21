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
SESSION_SECRET=USE_A_LONG_RANDOM_VALUE
```

The admin dashboard is `https://YOUR-RENDER-SERVICE.onrender.com/admin`. `FRONTEND_ORIGIN` accepts comma-separated URLs if you also use a custom domain.

## PostgreSQL

The backend creates the `orders` table on startup. Use Render Postgres, Neon, Supabase or another PostgreSQL provider. The database stores delivery information, items, totals, fulfilment status and call status. The four-digit demo code is validated and immediately discarded.

## SnapServe MCP configuration

The supplied MCP configuration describes a local STDIO process. On Render, its placeholder absolute path does not automatically exist. The `voiceorch` MCP build must be committed or installed inside the service. Then set:

```env
SNAPSERVE_API_KEY=YOUR_REAL_SERVER_SIDE_KEY
SNAPSERVE_BASE_URL=https://app.snapserve.ai/api
SNAPSERVE_MCP_SCRIPT=/opt/render/project/src/voiceorch/lib/snapserve-mcp/dist/index.js
SNAPSERVE_MCP_CALL_TOOL=THE_TOOL_NAME_DISCOVERED_IN_ADMIN
SNAPSERVE_MCP_CALL_ARGS_JSON={"agent_id":"YOUR_AGENT_ID","phone_number":"{{phone}}","variables":{"customer_name":"{{customerName}}","order_id":"{{orderId}}","order_total":"{{total}}","delivery_address":"{{address}}","items":"{{items}}"}}
AUTO_CALL_ON_ORDER=false
```

Important:

- Never expose `SNAPSERVE_API_KEY` in frontend code or a `NEXT_PUBLIC_*` variable.
- Sign in to `/admin` and click **Check SnapServe** to see exact MCP tools and schemas.
- Set `SNAPSERVE_MCP_CALL_TOOL` to the discovered outbound-call tool.
- Adjust `SNAPSERVE_MCP_CALL_ARGS_JSON` to match its exact schema.
- Keep `AUTO_CALL_ON_ORDER=false` while testing and use **Call customer** manually.
- After a successful test, set `AUTO_CALL_ON_ORDER=true` for automatic calls.

Supported argument-template tokens:

| Token | Value |
|---|---|
| `{{phone}}` | E.164 customer number |
| `{{customerName}}` | Customer name |
| `{{orderId}}` | Order reference |
| `{{total}}` | Final amount |
| `{{address}}` | Full delivery address |
| `{{items}}` | Spoken item summary |

## API endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/orders` | Public storefront | Create demo-authorized order |
| `POST` | `/api/orders/status` | Order ID + phone | Order lookup |
| `GET` | `/api/admin/orders` | Admin | List orders |
| `PATCH` | `/api/admin/orders/:id` | Admin | Update fulfilment status |
| `POST` | `/api/admin/orders/:id/call` | Admin | Initiate delivery call |
| `GET` | `/api/admin/snapserve/tools` | Admin | Discover MCP tools |
| `GET` | `/api/health` | Public | Render health check |

## Production notes

- This is a demo authorization, not a payment gateway. Do not present it as real payment.
- Add Razorpay, Stripe or another compliant provider before accepting money.
- Use strong admin credentials and HTTPS production URLs.
- Delivery data is sensitive; restrict database and admin access.
- Add rate limiting before a high-volume public launch.
- Obtain explicit consent for automated voice calls and follow applicable telecom/privacy rules.
- Replace demonstration photography with licensed brand-owned assets.
