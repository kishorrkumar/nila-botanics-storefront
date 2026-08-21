import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4000);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",").map(value => value.trim()).filter(Boolean);
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
  if (!origin || !allowedOrigins.includes(origin)) return {};
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

async function parseJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function cleanText(value, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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
    items: normaliseItems(body.items)
  };
  if (!order.customerName || !/^\+?[0-9 ()-]{8,20}$/.test(order.phone) || !order.addressLine || !order.city || !/^[0-9]{6}$/.test(order.postalCode)) return { error: "Please provide valid delivery details." };
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
    `INSERT INTO orders (order_number,customer_name,phone,email,address_line,city,postal_code,items,subtotal_paise,shipping_paise,total_paise)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11) RETURNING *`,
    [orderNumber, order.customerName, order.phone, order.email || null, order.addressLine, order.city, order.postalCode, JSON.stringify(order.items), subtotalPaise, shippingPaise, totalPaise]
  );
  return { row: result.rows[0] };
}

async function triggerSnapServe(order) {
  const url = process.env.SNAPSERVE_CALL_URL;
  if (!url) throw new Error("SNAPSERVE_CALL_URL is not configured in Render");
  await pool.query("UPDATE orders SET call_status='queued', call_error=NULL WHERE id=$1", [order.id]);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SNAPSERVE_API_KEY ? { Authorization: `Bearer ${process.env.SNAPSERVE_API_KEY}` } : {})
    },
    body: JSON.stringify({
      event: "delivery_confirmation_call",
      customer_name: order.customer_name,
      phone_number: order.phone,
      order_id: order.order_number,
      order_total: (order.total_paise / 100).toFixed(2),
      delivery_address: `${order.address_line}, ${order.city} - ${order.postal_code}`,
      items: order.items
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SnapServe rejected the call (${response.status}): ${text.slice(0, 240)}`);
  let reference = text.slice(0, 500);
  try { reference = JSON.parse(text).call_id || JSON.parse(text).id || reference; } catch {}
  await pool.query("UPDATE orders SET call_status='completed', call_reference=$2, call_error=NULL WHERE id=$1", [order.id, String(reference)]);
  return reference;
}

async function safelyTriggerSnapServe(order) {
  try { await triggerSnapServe(order); }
  catch (error) {
    await pool.query("UPDATE orders SET call_status='failed', call_error=$2 WHERE id=$1", [order.id, String(error.message).slice(0, 500)]);
    throw error;
  }
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

    if (req.method === "POST" && pathname === "/api/orders") {
      const created = await createOrder(await parseJson(req));
      if (created.error) return send(res, 400, created, cors);
      if (process.env.AUTO_CALL_ON_ORDER === "true") safelyTriggerSnapServe(created.row).catch(error => console.error("Automatic call failed:", error.message));
      return send(res, 201, {
        orderId: created.row.order_number,
        status: created.row.status,
        subtotal: created.row.subtotal_paise / 100,
        shipping: created.row.shipping_paise / 100,
        total: created.row.total_paise / 100
      }, cors);
    }

    if (req.method === "POST" && pathname === "/api/orders/status") {
      const body = await parseJson(req);
      const result = await pool.query("SELECT order_number,status,call_status,created_at,updated_at FROM orders WHERE order_number=$1 AND phone=$2", [cleanText(body.orderId, 32), cleanText(body.phone, 24)]);
      return result.rowCount ? send(res, 200, result.rows[0], cors) : send(res, 404, { error: "Order not found" }, cors);
    }

    if (pathname.startsWith("/api/admin/") && !requireAdmin(req, res)) return;

    if (req.method === "GET" && pathname === "/api/admin/orders") {
      const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500");
      return send(res, 200, { orders: result.rows });
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
        const reference = await safelyTriggerSnapServe(result.rows[0]);
        return send(res, 200, { accepted: true, reference });
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
