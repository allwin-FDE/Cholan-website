-- Selling, part 1: document numbering, orders, their lines, history and
-- dispatch details.

-- ---- Dates and numbering ----
CREATE FUNCTION core.today_ist() RETURNS date
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;

-- The Indian financial year (April to March) of a date, as '26-27'.
CREATE FUNCTION core.fy(d date) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT to_char(make_date(y, 1, 1), 'YY') || '-' || to_char(make_date(y + 1, 1, 1), 'YY')
  FROM (SELECT CASE WHEN extract(month FROM d) >= 4 THEN extract(year FROM d)::int ELSE extract(year FROM d)::int - 1 END AS y) s
$$;

-- One counter per kind of document, per scope (a GSTIN, or 'all') and year.
-- The owner can set where a series starts, so invoices carry on from the
-- paper bill book. A number is taken inside the document's own transaction:
-- if saving fails, the number goes back, so there are never gaps.
CREATE TABLE core.doc_series (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  doc_type text NOT NULL CHECK (doc_type IN ('order', 'invoice', 'credit_note', 'receipt')),
  scope text NOT NULL,
  fy text NOT NULL CHECK (fy = 'all' OR fy ~ '^[0-9]{2}-[0-9]{2}$'),
  prefix text NOT NULL CHECK (length(prefix) <= 10),
  next_no integer NOT NULL DEFAULT 1 CHECK (next_no >= 1),
  pad smallint NOT NULL DEFAULT 4 CHECK (pad BETWEEN 1 AND 8),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE (doc_type, scope, fy)
);
SELECT core.track('core.doc_series');

CREATE FUNCTION core.next_number(p_type text, p_scope text, p_fy text, p_prefix text, p_pad smallint DEFAULT 4) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  r core.doc_series;
BEGIN
  INSERT INTO core.doc_series (doc_type, scope, fy, prefix, pad) VALUES (p_type, p_scope, p_fy, p_prefix, p_pad)
  ON CONFLICT (doc_type, scope, fy) DO NOTHING;
  UPDATE core.doc_series SET next_no = next_no + 1
   WHERE doc_type = p_type AND scope = p_scope AND fy = p_fy
  RETURNING * INTO r;
  RETURN r.prefix || lpad((r.next_no - 1)::text, r.pad, '0');
END
$$;

-- ---- Orders ----
CREATE SCHEMA sales;
GRANT USAGE ON SCHEMA sales TO cholan_app, cholan_read;

CREATE TABLE sales.orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  branch_id smallint NOT NULL REFERENCES org.branches,
  party_id bigint NOT NULL REFERENCES party.parties,
  source text NOT NULL DEFAULT 'phone' CHECK (source IN ('phone', 'walk-in', 'whatsapp', 'enquiry', 'website', 'visit', 'other')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'packing', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned')),
  order_date date NOT NULL DEFAULT core.today_ist(),
  ship_to jsonb,                                   -- delivery address as it was on the order
  place_of_supply char(2) NOT NULL CHECK (place_of_supply ~ '^[0-9]{2}$'),
  includes_gst boolean NOT NULL DEFAULT true,       -- the prices are GST-inclusive
  subtotal_paise bigint NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
  notes text,
  enquiry_ref text,
  credit_override_by text,
  credit_override_reason text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
CREATE INDEX orders_party ON sales.orders (party_id);
CREATE INDEX orders_status ON sales.orders (status, order_date);
SELECT core.track('sales.orders');

CREATE TABLE sales.order_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES sales.orders,
  line_no smallint NOT NULL,
  item_id integer NOT NULL REFERENCES catalog.items,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price_paise bigint NOT NULL CHECK (unit_price_paise >= 0),
  price_source text NOT NULL,                       -- special, list:HOTEL, manual
  gst_rate_bp smallint NOT NULL CHECK (gst_rate_bp BETWEEN 0 AND 4000),
  hsn text NOT NULL,
  active boolean NOT NULL DEFAULT true,             -- a line taken off a new order
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE (order_id, line_no)
);
CREATE INDEX order_lines_order ON sales.order_lines (order_id);
SELECT core.track('sales.order_lines');

-- What happened to an order, in order. Never edited.
CREATE TABLE sales.order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES sales.orders,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT core.actor(),
  action text NOT NULL,
  from_status text,
  to_status text,
  detail text
);
CREATE INDEX order_events_order ON sales.order_events (order_id, at);
REVOKE UPDATE ON sales.order_events FROM cholan_app;

CREATE TABLE sales.dispatches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL UNIQUE REFERENCES sales.orders,
  dispatched_on date,
  vehicle_no text CHECK (vehicle_no ~ '^[A-Z0-9 -]{4,15}$'),
  driver_name text,
  driver_phone text CHECK (driver_phone ~ '^\+91[6-9][0-9]{9}$'),
  transporter text,
  lr_no text,
  lr_date date,
  eway_bill_no text CHECK (eway_bill_no ~ '^[0-9]{12}$'),
  eway_valid_until date,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('sales.dispatches');
