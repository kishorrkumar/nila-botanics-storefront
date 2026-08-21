import pg from "pg";

const { Pool } = pg;
const hasDatabase = Boolean(process.env.DATABASE_URL);
const memoryOrders = new Map();

export const pool = hasDatabase
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined })
  : null;

export async function initializeDatabase() {
  if (!pool) {
    console.warn("DATABASE_URL is not set. Orders use temporary memory storage and disappear after restart.");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      pincode TEXT NOT NULL,
      items JSONB NOT NULL,
      subtotal INTEGER NOT NULL,
      shipping INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'demo_authorized',
      status TEXT NOT NULL DEFAULT 'placed',
      snapserve_call_status TEXT NOT NULL DEFAULT 'not_started',
      call_consent BOOLEAN NOT NULL DEFAULT FALSE,
      snapserve_call_id TEXT,
      snapserve_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_consent BOOLEAN NOT NULL DEFAULT FALSE");
}

export async function createOrder(order) {
  if (!pool) {
    memoryOrders.set(order.id, order);
    return order;
  }
  const result = await pool.query(
    `INSERT INTO orders (id, customer_name, phone, email, address, city, pincode, items, subtotal, shipping, total, payment_status, status, snapserve_call_status, call_consent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [order.id, order.customer_name, order.phone, order.email, order.address, order.city, order.pincode, JSON.stringify(order.items), order.subtotal, order.shipping, order.total, order.payment_status, order.status, order.snapserve_call_status, order.call_consent]
  );
  return normalize(result.rows[0]);
}

export async function listOrders() {
  if (!pool) return [...memoryOrders.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const result = await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500");
  return result.rows.map(normalize);
}

export async function findOrder(id) {
  if (!pool) return memoryOrders.get(id) || null;
  const result = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  return result.rows[0] ? normalize(result.rows[0]) : null;
}

export async function findOrderForCustomer(id, phone) {
  if (!pool) {
    const order = memoryOrders.get(id);
    return order && digits(order.phone).endsWith(digits(phone).slice(-10)) ? order : null;
  }
  const result = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  const order = result.rows[0] ? normalize(result.rows[0]) : null;
  return order && digits(order.phone).endsWith(digits(phone).slice(-10)) ? order : null;
}

export async function updateOrderStatus(id, status) {
  if (!pool) {
    const order = memoryOrders.get(id);
    if (!order) return null;
    Object.assign(order, { status, updated_at: new Date().toISOString() });
    return order;
  }
  const result = await pool.query("UPDATE orders SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *", [id, status]);
  return result.rows[0] ? normalize(result.rows[0]) : null;
}

export async function updateCallState(id, fields) {
  const patch = {
    snapserve_call_status: fields.status,
    snapserve_call_id: fields.callId || null,
    snapserve_error: fields.error || null,
    updated_at: new Date().toISOString()
  };
  if (!pool) {
    const order = memoryOrders.get(id);
    if (!order) return null;
    Object.assign(order, patch);
    return order;
  }
  const result = await pool.query(
    "UPDATE orders SET snapserve_call_status=$2, snapserve_call_id=$3, snapserve_error=$4, updated_at=NOW() WHERE id=$1 RETURNING *",
    [id, patch.snapserve_call_status, patch.snapserve_call_id, patch.snapserve_error]
  );
  return result.rows[0] ? normalize(result.rows[0]) : null;
}

function normalize(row) {
  return {
    ...row,
    subtotal: Number(row.subtotal), shipping: Number(row.shipping), total: Number(row.total),
    created_at: new Date(row.created_at).toISOString(), updated_at: new Date(row.updated_at).toISOString()
  };
}

function digits(value = "") { return String(value).replace(/\D/g, ""); }
