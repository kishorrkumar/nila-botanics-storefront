import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4000);
const allowedOrigins = new Set([
  "http://localhost:3000",
  "https://nila-botanics-storefront.vercel.app",
  ...(process.env.FRONTEND_ORIGIN || "").split(",").map(value => value.trim()).filter(Boolean)
]);
const statuses = new Set(["placed", "confirmed", "packing", "shipped", "delivered", "cancelled"]);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Add the Neon pooled connection string in Render.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5
});

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...headers
  });
  res.end(payload);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Vary": "Origin"
  };
}

function isAdmin(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const suppliedUser = decoded.slice(0, separator);
  const suppliedPassword = decoded.slice(separator + 1);
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  if (!expectedPassword) return false;
  const safeEqual = (left, right) => {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  return safeEqual(suppliedUser, expectedUser) && safeEqual(suppliedPassword, expectedPassword);
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  send(res, 401, { error: "Admin authentication required" }, {
    "WWW-Authenticate": 'Basic realm="Nila Botanics Admin"'
  });
  return false;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseJson(req) {
  return JSON.parse((await readBody(req)).toString("utf8") || "{}");
}

function cleanText(value, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalisePhone(value) {
  return cleanText(value, 24).replace(/[ ()-]/g, "");
}

function toE164Phone(value) {
  const phone = normalisePhone(value);
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone;
  if (/^[6-9]\d{9}$/.test(phone)) return `+91${phone}`;
  if (/^91[6-9]\d{9}$/.test(phone)) return `+${phone}`;
  throw new Error("Customer phone must be a valid E.164 number, for example +919876543210");
}

function publicBaseUrl(req) {
  const configured = cleanText(process.env.SNAPSERVE_WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL, 2000);
  if (configured) return configured.replace(/\/$/, "");
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${protocol}://${req.headers.host}`;
}

function makeOrderNumber() {
  return `NILA-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(100, 1000)}`;
}

function normaliseItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 30) return null;
  const cleaned = items.map(item => ({
    id: cleanText(item?.id, 80),
    name: cleanText(item?.name, 160),
    price: Number(item?.price),
    quantity: Number(item?.quantity)
  }));
  if (cleaned.some(item => !item.id || !item.name || !Number.isInteger(item.price) || item.price < 0 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) return null;
  return cleaned;
}

function validateOrder(body) {
  const order = {
    customerName: cleanText(body.customerName, 120),
    phone: cleanText(body.phone, 24),
    email: cleanText(body.email, 255),
    addressLine: cleanText(body.addressLine, 500),
    city: cleanText(body.city, 100),
    postalCode: cleanText(body.postalCode, 12),
    authorizationCode: cleanText(body.authorizationCode, 4),
    voiceCallConsent: body.voiceCallConsent === true || body.voiceCallConsent === "true" || body.voiceCallConsent === "on",
    items: normaliseItems(body.items)
  };
  if (!order.customerName || !/^\+?[0-9 ()-]{8,20}$/.test(order.phone) || !order.addressLine || !order.city || !/^[0-9]{6}$/.test(order.postalCode)) return { error: "Please provide valid delivery details." };
  order.phone = normalisePhone(order.phone);
  if (order.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) return { error: "Please provide a valid email address." };
  if (!/^\d{4}$/.test(order.authorizationCode)) return { error: "Enter any four-digit demo authorization code." };
  if (!order.items) return { error: "The order must contain valid items." };
  return { order };
}

async function createOrder(body) {
  const checked = validateOrder(body);
  if (checked.error) return checked;
  const order = checked.order;
  const subtotalPaise = order.items.reduce((sum, item) => sum + item.price * item.quantity * 100, 0);
  const shippingPaise = subtotalPaise >= 79900 ? 0 : 6000;
  const totalPaise = subtotalPaise + shippingPaise;
  const orderNumber = makeOrderNumber();
  const result = await pool.query(
    `INSERT INTO orders (order_number,customer_name,phone,email,address_line,city,postal_code,items,subtotal_paise,shipping_paise,total_paise,voice_call_consent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12) RETURNING *`,
    [orderNumber, order.customerName, order.phone, order.email || null, order.addressLine, order.city, order.postalCode, JSON.stringify(order.items), subtotalPaise, shippingPaise, totalPaise, order.voiceCallConsent]
  );
  return { row: result.rows[0] };
}

function snapServeConfig() {
  const configuredBaseUrl = (process.env.SNAPSERVE_BASE_URL || "https://app.snapserve.ai/api").replace(/\/$/, "");
  return {
    apiKey: process.env.SNAPSERVE_API_KEY,
    baseUrl: configuredBaseUrl,
    outboundBaseUrl: configuredBaseUrl === "https://api.snapserve.ai/api" ? "https://app.snapserve.ai/api" : configuredBaseUrl
  };
}

function normaliseSnapServeAgents(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.agents ?? payload?.items ?? payload?.results ?? payload?.data?.agents ?? payload?.data?.items ?? payload?.data ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.map(agent => ({
    id: Number(agent.id ?? agent.agentId),
    name: cleanText(agent.name ?? agent.agentName ?? agent.title ?? `Agent ${agent.id}`, 160),
    status: cleanText(agent.status ?? agent.state, 40) || "available"
  })).filter(agent => Number.isSafeInteger(agent.id) && agent.id > 0);
}

async function fetchSnapServeAgents() {
  const { apiKey, baseUrl } = snapServeConfig();
  if (!apiKey) throw new Error("SNAPSERVE_API_KEY is not configured");
  const hosts = [...new Set([baseUrl, "https://app.snapserve.ai/api", "https://api.snapserve.ai/api"])];
  let lastError = "Agent endpoint unavailable";
  for (const host of hosts) {
    try {
      const response = await fetch(`${host}/agents`, { headers: { Authorization: `Bearer ${apiKey}` } });
      const text = await response.text();
      if (response.ok) return normaliseSnapServeAgents(JSON.parse(text));
      lastError = `${response.status}: ${text.slice(0, 160)}`;
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(`Unable to load SnapServe agents (${lastError})`);
}

async function triggerSnapServe(order, options = {}) {
  if (!order.voice_call_consent) throw new Error("The customer did not consent to an automated delivery call");
  await pool.query("UPDATE orders SET call_status='queued', call_error=NULL WHERE id=$1", [order.id]);

  const campaignUrl = process.env.SNAPSERVE_CAMPAIGN_WEBHOOK_URL;
  if (campaignUrl && !options.agentId) {
    const response = await fetch(campaignUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SNAPSERVE_CAMPAIGN_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SNAPSERVE_CAMPAIGN_WEBHOOK_TOKEN}` } : {})
      },
      body: JSON.stringify({
        phone: order.phone,
        name: order.customer_name,
        email: order.email,
        order_id: order.order_number,
        order_total: (order.total_paise / 100).toFixed(2),
        delivery_address: `${order.address_line}, ${order.city} - ${order.postal_code}`,
        items: order.items.map(item => `${item.name} x ${item.quantity}`).join(", ")
      })
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`SnapServe campaign intake rejected the order (${response.status}): ${text.slice(0, 240)}`);
    await pool.query("UPDATE orders SET call_status='queued', call_reference='campaign_intake', call_error=NULL WHERE id=$1", [order.id]);
    return "campaign_intake";
  }

  const agentId = Number(options.agentId || process.env.SNAPSERVE_AGENT_ID);
  let agentName = cleanText(options.agentName, 160) || null;
  const { apiKey, outboundBaseUrl } = snapServeConfig();
  if (!agentId || !apiKey) throw new Error("Configure SNAPSERVE_AGENT_ID and SNAPSERVE_API_KEY, or provide SNAPSERVE_CAMPAIGN_WEBHOOK_URL");
  if (options.agentId) {
    const selectedAgent = (await fetchSnapServeAgents()).find(agent => agent.id === agentId);
    if (!selectedAgent) throw new Error("The selected SnapServe agent is no longer available");
    agentName = selectedAgent.name;
  }
  const webhookBaseUrl = cleanText(options.webhookBaseUrl || process.env.SNAPSERVE_WEBHOOK_BASE_URL || process.env.RENDER_EXTERNAL_URL, 2000).replace(/\/$/, "");
  const response = await fetch(`${outboundBaseUrl}/calls/outbound`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      agentId,
      toNumber: toE164Phone(order.phone),
      ...(webhookBaseUrl ? { webhookBaseUrl } : {})
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SnapServe rejected the call (${response.status}): ${text.slice(0, 240)}`);
  const call = JSON.parse(text);
  await pool.query("UPDATE orders SET call_id=$2, call_status=$3, call_reference=$4, call_agent_id=$5, call_agent_name=$6, call_error=NULL WHERE id=$1", [order.id, call.id, call.status || "pending", String(call.executionId || call.id), agentId, agentName]);
  return call.id;
}

async function safelyTriggerSnapServe(order, options = {}) {
  try { await triggerSnapServe(order, options); }
  catch (error) {
    await pool.query("UPDATE orders SET call_status='failed', call_error=$2 WHERE id=$1", [order.id, String(error.message).slice(0, 500)]);
    throw error;
  }
}

function verifySnapServeSignature(rawBody, signature, timestamp) {
  const secret = process.env.SNAPSERVE_WEBHOOK_SECRET;
  if (!secret || !signature || !timestamp) return false;
  const eventTime = Number(timestamp);
  if (!Number.isFinite(eventTime) || Math.abs(Math.floor(Date.now() / 1000) - eventTime) > 300) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const supplied = Buffer.from(signature); const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && crypto.timingSafeEqual(supplied, wanted);
}

async function updateOrderFromCall(data) {
  const callId = Number(data.callId ?? data.id);
  const phone = normalisePhone(data.toNumber);
  const values = [
    callId || null,
    cleanText(data.status, 32) || "completed",
    Number.isFinite(Number(data.durationSeconds)) ? Number(data.durationSeconds) : null,
    Number.isFinite(Number(data.costCents)) ? Number(data.costCents) : null,
    cleanText(data.callSummary ?? data.summary, 10000) || null,
    cleanText(data.transcript, 100000) || null,
    data.dispositionResult == null ? null : JSON.stringify(data.dispositionResult),
    cleanText(data.recordingUrl, 2000) || null,
    phone,
    cleanText(data.errorMessage, 2000) || null
  ];
  const result = await pool.query(
    `UPDATE orders SET call_id=COALESCE($1,call_id),call_status=$2,call_duration_seconds=$3,call_cost_paise=$4,
      call_summary=$5,call_transcript=$6,call_disposition=$7::jsonb,call_recording_url=$8,call_error=$10
     WHERE id=(SELECT id FROM orders WHERE ($1::bigint IS NOT NULL AND call_id=$1) OR ($9<>'' AND regexp_replace(phone,'[ ()-]','','g')=$9 AND voice_call_consent=true) ORDER BY created_at DESC LIMIT 1)
     RETURNING *`, values
  );
  return result.rows[0] || null;
}

async function refreshSnapServeCall(order) {
  if (!order.call_id) throw new Error("This order does not have a direct SnapServe call ID yet");
  const apiKey = process.env.SNAPSERVE_API_KEY;
  if (!apiKey) throw new Error("SNAPSERVE_API_KEY is not configured");
  const { outboundBaseUrl } = snapServeConfig();
  const response = await fetch(`${outboundBaseUrl}/calls/${order.call_id}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Unable to load SnapServe call (${response.status}): ${text.slice(0, 240)}`);
  return updateOrderFromCall(JSON.parse(text));
}

async function getOrderAnalytics(days) {
  const [summaryResult, statusResult, dailyResult, productResult, callResult, agentResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS active_orders,
        COALESCE(SUM(total_paise) FILTER (WHERE status <> 'cancelled'),0)::bigint AS revenue_paise,
        COALESCE(AVG(total_paise) FILTER (WHERE status <> 'cancelled'),0)::bigint AS average_order_paise,
        COUNT(DISTINCT phone)::int AS customers
       FROM orders WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`, [days]),
    pool.query(
      `SELECT status, COUNT(*)::int AS count FROM orders
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day') GROUP BY status ORDER BY status`, [days]),
    pool.query(
      `SELECT created_at::date AS day, COUNT(*)::int AS orders,
        COALESCE(SUM(total_paise) FILTER (WHERE status <> 'cancelled'),0)::bigint AS revenue_paise
       FROM orders WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY created_at::date ORDER BY day`, [days]),
    pool.query(
      `SELECT item->>'name' AS name,
        SUM((item->>'quantity')::int)::int AS quantity,
        SUM((item->>'price')::numeric * (item->>'quantity')::int * 100)::bigint AS revenue_paise
       FROM orders CROSS JOIN LATERAL jsonb_array_elements(items) item
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day') AND status <> 'cancelled'
       GROUP BY item->>'name' ORDER BY quantity DESC, revenue_paise DESC LIMIT 8`, [days]),
    pool.query(
      `SELECT COUNT(*) FILTER (WHERE call_status <> 'not_called')::int AS attempted,
        COUNT(*) FILTER (WHERE call_status IN ('completed','connected','booked'))::int AS completed,
        COUNT(*) FILTER (WHERE call_status IN ('failed','cancelled','no_pickup','voicemail','busy'))::int AS unsuccessful,
        COALESCE(SUM(call_duration_seconds),0)::bigint AS duration_seconds,
        COALESCE(SUM(call_cost_paise),0)::bigint AS cost_paise
       FROM orders WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`, [days]),
    pool.query(
      `SELECT COALESCE(call_agent_name, CASE WHEN call_agent_id IS NULL THEN 'Campaign/default agent' ELSE 'Agent #' || call_agent_id END) AS name,
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE call_status IN ('completed','connected','booked'))::int AS completed
       FROM orders WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day') AND call_status <> 'not_called'
       GROUP BY call_agent_name,call_agent_id ORDER BY calls DESC`, [days])
  ]);
  const numberise = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, /^-?\d+(\.\d+)?$/.test(String(value)) ? Number(value) : value]));
  return {
    days,
    summary: numberise(summaryResult.rows[0]),
    statuses: statusResult.rows.map(numberise),
    daily: dailyResult.rows.map(numberise),
    products: productResult.rows.map(numberise),
    calls: numberise(callResult.rows[0]),
    agents: agentResult.rows.map(numberise)
  };
}

async function serveAdminAsset(req, res, pathname) {
  if (!requireAdmin(req, res)) return;
  const files = {
    "/admin": ["admin.html", "text/html; charset=utf-8"],
    "/admin/": ["admin.html", "text/html; charset=utf-8"],
    "/admin/admin.js": ["admin.js", "text/javascript; charset=utf-8"],
    "/admin/admin.css": ["admin.css", "text/css; charset=utf-8"]
  };
  const asset = files[pathname];
  if (!asset) return send(res, 404, { error: "Not found" });
  const content = await readFile(path.join(root, "public", asset[0]));
  res.writeHead(200, { "Content-Type": asset[1], "Content-Length": content.length, "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return send(res, 204, "", cors);

  try {
    if (pathname.startsWith("/admin")) return await serveAdminAsset(req, res, pathname);

    if (req.method === "GET" && pathname === "/api/health") {
      await pool.query("SELECT 1");
      return send(res, 200, { ok: true, service: "nila-botanics-admin", database: "connected" }, cors);
    }

    if (req.method === "POST" && pathname === "/api/webhooks/snapserve") {
      const rawBody = (await readBody(req)).toString("utf8");
      const signature = req.headers["x-snapserve-signature"];
      const timestamp = req.headers["x-snapserve-timestamp"];
      if (!verifySnapServeSignature(rawBody, signature, timestamp)) return send(res, 401, { error: "Invalid SnapServe signature" });
      const payload = JSON.parse(rawBody || "{}");
      if (!["call.completed", "call.failed", "call.ended"].includes(payload.event)) return send(res, 202, { accepted: true, ignored: true });
      const order = await updateOrderFromCall(payload.data || payload);
      return send(res, 200, { accepted: true, orderId: order?.order_number || null });
    }

    if (req.method === "POST" && pathname === "/api/orders") {
      const created = await createOrder(await parseJson(req));
      if (created.error) return send(res, 400, created, cors);
      if (process.env.AUTO_CALL_ON_ORDER === "true" && created.row.voice_call_consent) safelyTriggerSnapServe(created.row, { webhookBaseUrl: publicBaseUrl(req) }).catch(error => console.error("Automatic call failed:", error.message));
      return send(res, 201, {
        orderId: created.row.order_number,
        status: created.row.status,
        subtotal: created.row.subtotal_paise / 100,
        shipping: created.row.shipping_paise / 100,
        total: created.row.total_paise / 100,
        voiceCallRequested: created.row.voice_call_consent
      }, cors);
    }

    if (req.method === "POST" && pathname === "/api/orders/status") {
      const body = await parseJson(req);
      const result = await pool.query("SELECT order_number,status,call_status,created_at,updated_at FROM orders WHERE order_number=$1 AND regexp_replace(phone,'[ ()-]','','g')=$2", [cleanText(body.orderId, 32), normalisePhone(body.phone)]);
      return result.rowCount ? send(res, 200, result.rows[0], cors) : send(res, 404, { error: "Order not found" }, cors);
    }

    if (pathname.startsWith("/api/admin/") && !requireAdmin(req, res)) return;

    if (req.method === "GET" && pathname === "/api/admin/orders") {
      const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500");
      return send(res, 200, { orders: result.rows });
    }

    if (req.method === "GET" && pathname === "/api/admin/analytics") {
      const requestedDays = Number(url.searchParams.get("days") || 30);
      const days = [7, 30, 90, 365].includes(requestedDays) ? requestedDays : 30;
      return send(res, 200, await getOrderAnalytics(days));
    }

    if (req.method === "GET" && pathname === "/api/admin/snapserve") {
      const publicProtocol = String(req.headers["x-forwarded-proto"] || "http").split(",")[0];
      return send(res, 200, {
        mode: process.env.SNAPSERVE_CAMPAIGN_WEBHOOK_URL ? "campaign_webhook" : (process.env.SNAPSERVE_AGENT_ID && process.env.SNAPSERVE_API_KEY ? "direct_api" : "not_configured"),
        automaticCalls: process.env.AUTO_CALL_ON_ORDER === "true",
        resultWebhook: Boolean(process.env.SNAPSERVE_WEBHOOK_SECRET),
        resultWebhookUrl: `${publicProtocol}://${req.headers.host}/api/webhooks/snapserve`
      });
    }

    if (req.method === "GET" && pathname === "/api/admin/snapserve/agents") {
      try {
        return send(res, 200, { agents: await fetchSnapServeAgents() });
      } catch (error) {
        return send(res, 502, { error: error.message, agents: [] });
      }
    }

    const statusMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (req.method === "PATCH" && statusMatch) {
      const body = await parseJson(req);
      if (!statuses.has(body.status)) return send(res, 400, { error: "Invalid order status" });
      const result = await pool.query("UPDATE orders SET status=$2 WHERE id=$1 RETURNING *", [statusMatch[1], body.status]);
      return result.rowCount ? send(res, 200, { order: result.rows[0] }) : send(res, 404, { error: "Order not found" });
    }

    const callMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)\/call$/);
    if (req.method === "POST" && callMatch) {
      const result = await pool.query("SELECT * FROM orders WHERE id=$1", [callMatch[1]]);
      if (!result.rowCount) return send(res, 404, { error: "Order not found" });
      try {
        const body = await parseJson(req);
        const requestedAgentId = body.agentId == null || body.agentId === "" ? null : Number(body.agentId);
        if (requestedAgentId != null && (!Number.isSafeInteger(requestedAgentId) || requestedAgentId < 1)) return send(res, 400, { error: "Select a valid SnapServe agent" });
        let order = result.rows[0];
        if (!order.voice_call_consent) {
          if (body.confirmConsent !== true) return send(res, 409, { error: "Confirm that the customer consented before starting the call" });
          const consented = await pool.query("UPDATE orders SET voice_call_consent=true WHERE id=$1 RETURNING *", [order.id]);
          order = consented.rows[0];
        }
        const reference = await safelyTriggerSnapServe(order, { agentId: requestedAgentId, agentName: body.agentName, webhookBaseUrl: publicBaseUrl(req) });
        return send(res, 200, { accepted: true, reference });
      } catch (error) {
        return send(res, 502, { error: error.message });
      }
    }

    const refreshMatch = pathname.match(/^\/api\/admin\/orders\/(\d+)\/call\/refresh$/);
    if (req.method === "POST" && refreshMatch) {
      const result = await pool.query("SELECT * FROM orders WHERE id=$1", [refreshMatch[1]]);
      if (!result.rowCount) return send(res, 404, { error: "Order not found" });
      try {
        const order = await refreshSnapServeCall(result.rows[0]);
        return send(res, 200, { order });
      } catch (error) {
        return send(res, 502, { error: error.message });
      }
    }

    send(res, 404, { error: "Not found" }, cors);
  } catch (error) {
    console.error(error);
    send(res, 500, { error: "Server error. Please try again." }, cors);
  }
});

const schema = await readFile(path.join(root, "schema.sql"), "utf8");
await pool.query(schema);
server.listen(port, "0.0.0.0", () => console.log(`Nila Botanics admin listening on port ${port}`));

async function shutdown() {
  server.close(async () => { await pool.end(); process.exit(0); });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
