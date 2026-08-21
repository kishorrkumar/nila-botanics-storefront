CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(32) UNIQUE NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(24) NOT NULL,
  email VARCHAR(255),
  address_line TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  postal_code VARCHAR(12) NOT NULL,
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  shipping_paise INTEGER NOT NULL DEFAULT 0 CHECK (shipping_paise >= 0),
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  voice_call_consent BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'placed'
    CHECK (status IN ('placed','confirmed','packing','shipped','delivered','cancelled')),
  call_status VARCHAR(32) NOT NULL DEFAULT 'not_called',
  call_id BIGINT,
  call_reference TEXT,
  call_error TEXT,
  call_duration_seconds INTEGER,
  call_cost_paise INTEGER,
  call_summary TEXT,
  call_transcript TEXT,
  call_disposition JSONB,
  call_recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS voice_call_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_id BIGINT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_duration_seconds INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_cost_paise INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_summary TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_transcript TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_disposition JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS call_recording_url TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_call_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_call_status_check CHECK (call_status IN (
  'not_called','queued','pending','ringing','in_progress','connected','completed',
  'failed','cancelled','transferred','no_pickup','voicemail','busy','booked','callback_scheduled'
));

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders (phone);
CREATE INDEX IF NOT EXISTS orders_call_id_idx ON orders (call_id);

CREATE OR REPLACE FUNCTION set_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_orders_updated_at();
