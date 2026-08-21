import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createOrder, findOrder, findOrderForCustomer, initializeDatabase, listOrders, updateCallState, updateOrderStatus } from "./db.js";
import { listSnapServeTools, placeDeliveryCall } from "./snapserve.js";
import { catalog, priceItems } from "./catalog.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const directory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.join(directory, "..", "public");
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000").split(",").map(value => value.trim()).filter(Boolean);
const statuses = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"];

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); }, methods: ["GET", "POST", "PATCH"] }));
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (_, response) => response.json({ status: "ok", service: "nila-admin-api", database: process.env.DATABASE_URL ? "postgres" : "memory" }));

app.post("/api/orders", async (request, response, next) => {
  try {
    const validationError = validateOrder(request.body);
    if (validationError) return response.status(400).json({ error: validationError });
    const items = priceItems(request.body.items);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = subtotal >= 799 ? 0 : 69;
    const now = new Date().toISOString();
    const order = await createOrder({
      id: createOrderId(), customer_name: clean(request.body.customerName, 80), phone: clean(request.body.phone, 20), email: clean(request.body.email || "", 120),
      address: clean(request.body.address, 240), city: clean(request.body.city, 80), pincode: clean(request.body.pincode, 10),
      items,
      subtotal, shipping, total: subtotal + shipping, payment_status: "demo_authorized", status: "placed", snapserve_call_status: process.env.AUTO_CALL_ON_ORDER === "true" ? "queued" : "not_started", call_consent: true, created_at: now, updated_at: now
    });
    response.status(201).json({ order: publicOrder(order), message: "Order placed. The four-digit demo code was verified and not stored." });
    if (process.env.AUTO_CALL_ON_ORDER === "true") triggerCall(order).catch(error => console.error("Automatic SnapServe call failed", error));
  } catch (error) { next(error); }
});

app.post("/api/orders/status", async (request, response, next) => {
  try {
    if (!request.body?.orderId || !request.body?.phone) return response.status(400).json({ error: "orderId and phone are required" });
    const order = await findOrderForCustomer(clean(request.body.orderId, 40), clean(request.body.phone, 20));
    if (!order) return response.status(404).json({ error: "Order not found for this phone number" });
    response.json({ order: publicOrder(order) });
  } catch (error) { next(error); }
});

app.get("/admin", (_, response) => response.sendFile(path.join(publicDirectory, "admin.html")));
app.use("/admin-assets", express.static(publicDirectory, { index: false, maxAge: "1h" }));

app.post("/api/admin/login", (request, response) => {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return response.status(503).json({ error: "ADMIN_PASSWORD is not configured" });
  if (!safeEqual(request.body?.username, username) || !safeEqual(request.body?.password, password)) return response.status(401).json({ error: "Invalid username or password" });
  response.setHeader("Set-Cookie", `nila_admin=${createSession()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
  response.json({ authenticated: true });
});
app.post("/api/admin/logout", (_, response) => { response.setHeader("Set-Cookie", "nila_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"); response.json({ authenticated: false }); });
app.get("/api/admin/session", requireAdmin, (_, response) => response.json({ authenticated: true }));
app.get("/api/admin/orders", requireAdmin, async (_, response, next) => { try { response.json({ orders: await listOrders() }); } catch (error) { next(error); } });
app.patch("/api/admin/orders/:id", requireAdmin, async (request, response, next) => {
  try {
    if (!statuses.includes(request.body?.status)) return response.status(400).json({ error: "Invalid order status" });
    const order = await updateOrderStatus(request.params.id, request.body.status);
    if (!order) return response.status(404).json({ error: "Order not found" });
    response.json({ order });
  } catch (error) { next(error); }
});
app.post("/api/admin/orders/:id/call", requireAdmin, async (request, response, next) => {
  try {
    const order = await findOrder(request.params.id);
    if (!order) return response.status(404).json({ error: "Order not found" });
    response.status(202).json({ accepted: true, message: "Delivery call queued" });
    triggerCall(order).catch(error => console.error("Manual SnapServe call failed", error));
  } catch (error) { next(error); }
});
app.get("/api/admin/snapserve/tools", requireAdmin, async (_, response, next) => { try { response.json(await listSnapServeTools()); } catch (error) { next(error); } });

app.use((error, _request, response, _next) => { console.error(error); response.status(500).json({ error: error.message || "Unexpected server error" }); });

await initializeDatabase();
app.listen(port, "0.0.0.0", () => console.log(`Nila admin API listening on ${port}`));

async function triggerCall(order) {
  await updateCallState(order.id, { status: "calling" });
  try {
    const call = await placeDeliveryCall(order);
    await updateCallState(order.id, { status: "initiated", callId: call.callId });
  } catch (error) {
    await updateCallState(order.id, { status: "failed", error: error.message });
    throw error;
  }
}

function validateOrder(body) {
  if (!body || !/^\d{4}$/.test(String(body.demoPasscode || ""))) return "Enter any four-digit demo authorization code";
  if (body.callConsent !== "yes" && body.callConsent !== true) return "Consent is required for the automated delivery call";
  for (const field of ["customerName", "phone", "address", "city", "pincode"]) if (!String(body[field] || "").trim()) return `${field} is required`;
  if (!/^[6-9]\d{9}$/.test(String(body.phone).replace(/\D/g, "").slice(-10))) return "Enter a valid Indian mobile number";
  if (!/^\d{6}$/.test(String(body.pincode).replace(/\D/g, ""))) return "Enter a valid six-digit pincode";
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30) return "Your bag is empty or too large";
  for (const item of body.items) if (!item.id || !catalog.has(String(item.id)) || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 20) return "Invalid cart item";
  return null;
}

function publicOrder(order) { return { id: order.id, customerName: order.customer_name, total: order.total, status: order.status, paymentStatus: order.payment_status, callStatus: order.snapserve_call_status, createdAt: order.created_at }; }
function createOrderId() { return `NB-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`; }
function clean(value, max) { return String(value || "").trim().slice(0, max); }
function safeEqual(left, right) { const a = Buffer.from(String(left || "")); const b = Buffer.from(String(right || "")); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function createSession() { const expires = Date.now() + 8 * 60 * 60 * 1000; const payload = Buffer.from(JSON.stringify({ expires })).toString("base64url"); return `${payload}.${sign(payload)}`; }
function requireAdmin(request, response, next) { const token = parseCookies(request.headers.cookie || "").nila_admin; if (!token || !verifySession(token)) return response.status(401).json({ error: "Authentication required" }); next(); }
function verifySession(token) { const [payload, signature] = token.split("."); if (!payload || !signature || !safeEqual(signature, sign(payload))) return false; try { return JSON.parse(Buffer.from(payload, "base64url").toString()).expires > Date.now(); } catch { return false; } }
function sign(payload) { return crypto.createHmac("sha256", process.env.SESSION_SECRET || "development-only-secret").update(payload).digest("base64url"); }
function parseCookies(header) { return Object.fromEntries(header.split(";").filter(Boolean).map(value => { const index = value.indexOf("="); return [value.slice(0, index).trim(), value.slice(index + 1).trim()]; })); }
