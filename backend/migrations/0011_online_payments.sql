-- Phase 4: online payments with Razorpay Standard Checkout.
--
-- A website order waits for payment ("awaiting_payment") with its bags held;
-- it confirms itself when Razorpay says it is paid, or is cancelled and the
-- bags released when it is not paid in time. Every Razorpay order, payment,
-- refund and notification is recorded once: a payment can never be counted
-- twice, however many times Razorpay sends it.
--
-- Online payment stays off until pay.online_enabled is set to true (after
-- testing with Razorpay test keys).

ALTER TABLE sales.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE sales.orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'awaiting_payment', 'new', 'confirmed', 'packing', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned'));

INSERT INTO core.settings (key, value, note) VALUES
  ('pay.online_enabled', 'false', 'Website orders paid online with Razorpay. Turn on only after testing with test keys.'),
  ('pay.unpaid_expiry_minutes', '30', 'A website order not paid within this many minutes is cancelled and its bags released.')
ON CONFLICT (key) DO NOTHING;

CREATE SCHEMA pay;
GRANT USAGE ON SCHEMA pay TO cholan_app, cholan_read;

-- One Razorpay order per website order.
CREATE TABLE pay.razorpay_orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL UNIQUE REFERENCES sales.orders,
  rp_order_id text NOT NULL UNIQUE,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'expired', 'paid_late', 'refunded')),
  receipt_id bigint REFERENCES sales.receipts,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('pay.razorpay_orders');

-- Each payment once, by Razorpay's payment id.
CREATE TABLE pay.razorpay_payments (
  rp_payment_id text PRIMARY KEY,
  rp_order_id text NOT NULL,
  order_id bigint REFERENCES sales.orders,
  amount_paise bigint NOT NULL,
  status text NOT NULL,
  method text,
  via text NOT NULL CHECK (via IN ('checkout', 'webhook', 'reconcile')),
  receipt_id bigint REFERENCES sales.receipts,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX razorpay_payments_order ON pay.razorpay_payments (rp_order_id);
REVOKE UPDATE ON pay.razorpay_payments FROM cholan_app;
GRANT UPDATE (receipt_id) ON pay.razorpay_payments TO cholan_app;

-- Each notification once, by Razorpay's event id.
CREATE TABLE pay.webhook_events (
  event_id text PRIMARY KEY,
  event text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  result text
);

CREATE TABLE pay.refunds (
  rp_refund_id text PRIMARY KEY,
  rp_payment_id text NOT NULL REFERENCES pay.razorpay_payments,
  order_id bigint REFERENCES sales.orders,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  status text NOT NULL,
  reason text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor()
);

GRANT SELECT ON ALL TABLES IN SCHEMA pay TO cholan_read;
