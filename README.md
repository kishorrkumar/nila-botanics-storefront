# Nila Botanics ecommerce storefront

A complete, responsive botanical-care storefront inspired by the shopping structure of melinam.in, but rebuilt with an original brand, visual system, copy and product catalog. It is ready for local development, Vercel deployment and a later SnapServe MCP connection.

## Stack

- Next.js App Router
- React + TypeScript
- Responsive custom CSS (no UI framework required)
- Server-side API routes for catalog, lead capture and order-status integration
- Zero database dependency for the first deployment

## Features

- Responsive home, navigation, hero, collections, catalog, story, testimonials, FAQ and footer
- Product search and category filters
- Product detail routes generated from a typed catalog
- Client-side shopping bag with quantity controls and subtotal
- Routine-help form wired to an optional SnapServe webhook
- Health-check endpoint
- MCP-friendly JSON catalog and order-status endpoints
- Vercel-ready project structure

## A–Z local setup

### 1. Prerequisites

Install Node.js 20.9 or newer and Git.

### 2. Clone and install

```bash
git clone https://github.com/kishorrkumar/ecommerce.git
cd ecommerce
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

The storefront works without environment variables. Add these only when SnapServe is ready:

```env
SNAPSERVE_MCP_WEBHOOK_URL=https://your-snapserve-webhook.example/path
SNAPSERVE_MCP_API_KEY=your_server_side_secret
NEXT_PUBLIC_SUPPORT_EMAIL=hello@yourdomain.in
NEXT_PUBLIC_SUPPORT_PHONE=+91XXXXXXXXXX
```

Never prefix a secret with `NEXT_PUBLIC_`.

### 4. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`. Check the server at `http://localhost:3000/api/health`.

### 5. Production verification

```bash
npm run build
npm start
```

### 6. Deploy to Vercel

1. Import `kishorrkumar/ecommerce` in Vercel.
2. Keep Framework Preset as Next.js.
3. Add environment variables from `.env.local` in Project Settings → Environment Variables.
4. Deploy. Vercel uses `npm run build` automatically.

## SnapServe MCP integration map

The server boundary is already prepared so the browser never receives your SnapServe secret.

| MCP tool | Website route | Purpose |
|---|---|---|
| `get_catalog` | `GET /api/mcp/catalog` | Read products, prices, variants and benefits |
| `capture_lead` | `POST /api/mcp/leads` | Capture name, phone, goal and source |
| `get_order_status` | `POST /api/mcp/order-status` | Verify an order before speaking its status |
| `health_check` | `GET /api/health` | Confirm the storefront service is online |

Example lead payload:

```json
{
  "name": "Kishore",
  "phone": "+919000000000",
  "goal": "Hair care",
  "source": "snapserve-voice-agent"
}
```

Example order payload:

```json
{
  "orderId": "NB-1042",
  "phone": "+919000000000"
}
```

### Recommended SnapServe tool rules

- Read the catalog before stating a price, size or product benefit.
- Confirm the caller's phone number before order lookup.
- Do not claim medical results; describe product benefits exactly as returned.
- Ask permission before saving a new lead or callback request.
- Keep the API key only in the server-side environment.
- Replace the placeholder order-status handler with your real CRM/order database lookup before production.

## Where to edit

- Brand, products and pricing: `src/lib/products.ts`
- Home experience and form: `src/components/storefront.tsx`
- Visual design: `src/app/globals.css`
- Product page: `src/app/products/[slug]/page.tsx`
- SnapServe lead relay: `src/app/api/mcp/leads/route.ts`
- Order integration: `src/app/api/mcp/order-status/route.ts`

## Production checklist

- Replace placeholder support phone and email.
- Replace demo product photography with licensed brand-owned assets.
- Connect a database or commerce backend for inventory, checkout and orders.
- Connect Razorpay/Stripe/Shopify checkout only from secure server routes.
- Add privacy, shipping, return and terms pages reviewed for your business.
- Add rate limiting, request validation, logging and bot protection to public write endpoints.
- Add explicit consent text for calls, WhatsApp and marketing follow-ups.
- Verify every SnapServe tool response against the deployed API.

## Important scope note

The bag and checkout button are a polished storefront demo. They do not charge customers or create real orders until a commerce/payment backend is connected.
