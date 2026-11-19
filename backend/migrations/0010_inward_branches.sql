-- Phase 3: inward and branches.
--
-- Batches (mill lot, packed date, best-before) so it is known which bags went
-- to which customer; transfers between branches through an "in transit"
-- place; purchase orders, goods received (weighbridge, moisture, accepted and
-- rejected), supplier bills with input tax, supplier payments and purchase
-- returns (debit notes); packing runs (raw rice and empty bags in, packed bags
-- out); stock changes asked for by staff and approved by a manager; and
-- day-to-day expenses. Everything that moves stock is a row in
-- inv.stock_moves, exactly as in Phase 2.

-- ---- Numbering for the new documents ----
ALTER TABLE core.doc_series DROP CONSTRAINT doc_series_doc_type_check;
ALTER TABLE core.doc_series ADD CONSTRAINT doc_series_doc_type_check CHECK (doc_type IN (
  'order', 'invoice', 'credit_note', 'receipt',
  'transfer', 'purchase_order', 'goods_received', 'purchase_bill', 'supplier_payment', 'debit_note',
  'packing_run', 'stock_request', 'expense'));

-- ---- Batches ----
CREATE TABLE inv.batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id integer NOT NULL REFERENCES catalog.items,
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]{0,29}$'),
  source text NOT NULL CHECK (source IN ('opening', 'inward', 'packing', 'other')),
  mill_lot text,
  packed_on date,
  best_before date,
  supplier_id bigint REFERENCES party.parties,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE (item_id, code),
  CHECK (best_before IS NULL OR packed_on IS NULL OR best_before >= packed_on)
);
SELECT core.track('inv.batches');

ALTER TABLE inv.stock_moves ADD COLUMN batch_id bigint REFERENCES inv.batches;
CREATE INDEX stock_moves_batch ON inv.stock_moves (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX stock_moves_location_item ON inv.stock_moves (location_id, item_id, at);
ALTER TABLE inv.stock_moves DROP CONSTRAINT stock_moves_type_check;
ALTER TABLE inv.stock_moves ADD CONSTRAINT stock_moves_type_check CHECK (type IN (
  'opening', 'receive', 'adjust', 'reserve', 'release', 'dispatch', 'return', 'return_damaged', 'damage', 'write_off',
  'transfer_out', 'transfer_in', 'transfer_loss', 'pack_in', 'pack_out', 'purchase_return'));
ALTER TABLE inv.stock_moves DROP CONSTRAINT stock_moves_ref_type_check;
ALTER TABLE inv.stock_moves ADD CONSTRAINT stock_moves_ref_type_check CHECK (ref_type IN (
  'order', 'return', 'adjustment', 'transfer', 'goods_received', 'packing_run', 'purchase_return', 'stock_request'));

-- Bags of each batch in each place, from the moves that named the batch.
CREATE VIEW inv.batch_stock AS
SELECT m.location_id, m.item_id, m.batch_id, b.code, b.mill_lot, b.packed_on, b.best_before,
       sum(m.on_hand_change)::integer AS on_hand
FROM inv.stock_moves m JOIN inv.batches b ON b.id = m.batch_id
GROUP BY m.location_id, m.item_id, m.batch_id, b.code, b.mill_lot, b.packed_on, b.best_before
HAVING sum(m.on_hand_change) <> 0;

-- Which batch went to which customer.
CREATE VIEW inv.batch_dispatches AS
SELECT m.batch_id, b.code AS batch_code, m.item_id, -m.on_hand_change AS qty, m.at, o.id AS order_id, o.number AS order_number,
       o.party_id, p.display_name AS party_name
FROM inv.stock_moves m
JOIN inv.batches b ON b.id = m.batch_id
JOIN sales.orders o ON m.ref_type = 'order' AND o.id = m.ref_id
JOIN party.parties p ON p.id = o.party_id
WHERE m.type = 'dispatch';

-- ---- Transfers between branches ----
-- Sending takes bags out of the sending godown into the receiving branch's
-- "in transit" place; receiving moves what arrived into its godown, and any
-- shortfall is recorded as lost on the way.
CREATE TABLE inv.transfers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  from_location_id integer NOT NULL REFERENCES org.locations,
  to_location_id integer NOT NULL REFERENCES org.locations,
  transit_location_id integer NOT NULL REFERENCES org.locations,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'cancelled')),
  sent_on date NOT NULL DEFAULT core.today_ist(),
  received_on date,
  vehicle_no text,
  driver text,
  notes text,
  receive_notes text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (from_location_id <> to_location_id),
  CHECK (status <> 'received' OR received_on IS NOT NULL),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX transfers_status ON inv.transfers (status, sent_on);
SELECT core.track('inv.transfers');

CREATE TABLE inv.transfer_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transfer_id bigint NOT NULL REFERENCES inv.transfers,
  item_id integer NOT NULL REFERENCES catalog.items,
  batch_id bigint REFERENCES inv.batches,
  qty_sent integer NOT NULL CHECK (qty_sent > 0),
  qty_received integer CHECK (qty_received >= 0),
  CHECK (qty_received IS NULL OR qty_received <= qty_sent)
);
CREATE INDEX transfer_lines_transfer ON inv.transfer_lines (transfer_id);

-- ---- Packing runs ----
CREATE TABLE inv.packing_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  location_id integer NOT NULL REFERENCES org.locations,
  run_date date NOT NULL DEFAULT core.today_ist(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor()
);
REVOKE UPDATE ON inv.packing_runs FROM cholan_app;

CREATE TABLE inv.packing_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES inv.packing_runs,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  item_id integer NOT NULL REFERENCES catalog.items,
  batch_id bigint REFERENCES inv.batches,
  qty integer NOT NULL CHECK (qty > 0)
);
CREATE INDEX packing_lines_run ON inv.packing_lines (run_id);
REVOKE UPDATE ON inv.packing_lines FROM cholan_app;

-- ---- Stock changes asked for by staff, decided by a manager ----
CREATE TABLE inv.stock_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  location_id integer NOT NULL REFERENCES org.locations,
  item_id integer NOT NULL REFERENCES catalog.items,
  batch_id bigint REFERENCES inv.batches,
  kind text NOT NULL CHECK (kind IN ('adjust', 'damage', 'write_off')),
  qty integer NOT NULL CHECK (qty <> 0),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  requested_by text NOT NULL DEFAULT core.actor(),
  decided_at timestamptz,
  decided_by text,
  decision_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (status = 'pending' OR (decided_at IS NOT NULL AND decided_by IS NOT NULL))
);
CREATE INDEX stock_requests_status ON inv.stock_requests (status, requested_at);
SELECT core.track('inv.stock_requests');

-- ---- Purchases ----
CREATE SCHEMA purch;
GRANT USAGE ON SCHEMA purch TO cholan_app, cholan_read;

CREATE TABLE purch.orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  branch_id smallint NOT NULL REFERENCES org.branches,
  party_id bigint NOT NULL REFERENCES party.parties,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'part_received', 'received', 'closed', 'cancelled')),
  order_date date NOT NULL DEFAULT core.today_ist(),
  expected_on date,
  notes text,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX purchase_orders_party ON purch.orders (party_id, order_date);
SELECT core.track('purch.orders');

CREATE TABLE purch.order_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES purch.orders,
  line_no smallint NOT NULL,
  item_id integer NOT NULL REFERENCES catalog.items,
  qty integer NOT NULL CHECK (qty > 0),               -- in the item's unit (bags, kg, pieces)
  rate_paise bigint NOT NULL CHECK (rate_paise >= 0), -- per unit, before GST
  gst_rate_bp smallint NOT NULL CHECK (gst_rate_bp BETWEEN 0 AND 4000),
  qty_received integer NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  UNIQUE (order_id, line_no)
);
CREATE INDEX purchase_order_lines_order ON purch.order_lines (order_id);

-- Goods received (GRN): what came in on a vehicle, weighed and checked. The
-- accepted quantity goes into stock as a new batch; the rest is rejected.
CREATE TABLE purch.receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  location_id integer NOT NULL REFERENCES org.locations,
  party_id bigint NOT NULL REFERENCES party.parties,
  order_id bigint REFERENCES purch.orders,
  received_on date NOT NULL DEFAULT core.today_ist(),
  vehicle_no text,
  weighbridge_ticket text,
  gross_kg numeric(12, 2) CHECK (gross_kg > 0),
  tare_kg numeric(12, 2) CHECK (tare_kg >= 0),
  moisture_pct numeric(5, 2) CHECK (moisture_pct BETWEEN 0 AND 100),
  supplier_doc_no text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  CHECK (gross_kg IS NULL OR tare_kg IS NULL OR tare_kg < gross_kg)
);
CREATE INDEX goods_received_party ON purch.receipts (party_id, received_on);
REVOKE UPDATE ON purch.receipts FROM cholan_app;

CREATE TABLE purch.receipt_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id bigint NOT NULL REFERENCES purch.receipts,
  line_no smallint NOT NULL,
  item_id integer NOT NULL REFERENCES catalog.items,
  order_line_id bigint REFERENCES purch.order_lines,
  qty_received integer NOT NULL CHECK (qty_received > 0),
  qty_accepted integer NOT NULL CHECK (qty_accepted >= 0),
  reject_reason text,
  batch_id bigint REFERENCES inv.batches,
  UNIQUE (receipt_id, line_no),
  CHECK (qty_accepted <= qty_received),
  CHECK (qty_accepted = qty_received OR reject_reason IS NOT NULL)
);
REVOKE UPDATE ON purch.receipt_lines FROM cholan_app;

-- Supplier bills: what the supplier charged, with the input tax to claim.
-- Saved once; a wrong bill is cancelled with a reason and entered again.
CREATE TABLE purch.bills (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,                       -- our own reference
  supplier_bill_no text NOT NULL,
  bill_date date NOT NULL,
  party_id bigint NOT NULL REFERENCES party.parties,
  branch_id smallint NOT NULL REFERENCES org.branches,
  goods_received_id bigint REFERENCES purch.receipts,
  supplier_gstin text CHECK (supplier_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  interstate boolean NOT NULL,
  taxable_paise bigint NOT NULL CHECK (taxable_paise >= 0),
  cgst_paise bigint NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise bigint NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise bigint NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  round_off_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL CHECK (total_paise > 0),
  itc_eligible boolean NOT NULL DEFAULT true,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)),
  CHECK (interstate OR igst_paise = 0),
  CHECK (NOT interstate OR (cgst_paise = 0 AND sgst_paise = 0))
);
-- The same supplier bill can't be entered twice.
CREATE UNIQUE INDEX bills_once ON purch.bills (party_id, lower(supplier_bill_no)) WHERE status = 'open';
CREATE INDEX bills_party ON purch.bills (party_id, bill_date);
SELECT core.track('purch.bills');

CREATE FUNCTION purch.freeze_bill() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'This bill is cancelled and can no longer be changed.' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by', 'updated_at', 'updated_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by', 'updated_at', 'updated_by']) THEN
    RAISE EXCEPTION 'A saved bill cannot be changed. Cancel it and enter it again.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER freeze_saved BEFORE UPDATE ON purch.bills FOR EACH ROW EXECUTE FUNCTION purch.freeze_bill();

CREATE TABLE purch.bill_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bill_id bigint NOT NULL REFERENCES purch.bills,
  line_no smallint NOT NULL,
  item_id integer REFERENCES catalog.items,
  description text NOT NULL,
  hsn text CHECK (hsn ~ '^[0-9]{4}([0-9]{2}){0,2}$'),
  qty numeric(14, 3) NOT NULL CHECK (qty > 0),
  unit text NOT NULL,
  rate_paise bigint NOT NULL CHECK (rate_paise >= 0),
  gst_rate_bp smallint NOT NULL CHECK (gst_rate_bp BETWEEN 0 AND 4000),
  taxable_paise bigint NOT NULL,
  cgst_paise bigint NOT NULL,
  sgst_paise bigint NOT NULL,
  igst_paise bigint NOT NULL,
  UNIQUE (bill_id, line_no)
);
REVOKE UPDATE ON purch.bill_lines FROM cholan_app;

-- Money paid to suppliers, matched to their bills. Never deleted: a mistake
-- is reversed with the reason kept.
CREATE TABLE purch.payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  payment_date date NOT NULL DEFAULT core.today_ist(),
  party_id bigint NOT NULL REFERENCES party.parties,
  method text NOT NULL CHECK (method IN ('cash', 'upi', 'bank', 'cheque', 'other')),
  reference text,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  reversed_at timestamptz,
  reversed_by text,
  reverse_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (status <> 'reversed' OR (reverse_reason IS NOT NULL AND reversed_at IS NOT NULL))
);
CREATE INDEX supplier_payments_party ON purch.payments (party_id, payment_date);
SELECT core.track('purch.payments');
-- The same rule as a customer receipt: only reversing may change it.
CREATE FUNCTION purch.freeze_payment() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'reversed' THEN
    RAISE EXCEPTION 'This payment is reversed and can no longer be changed.' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'reversed_at', 'reversed_by', 'reverse_reason', 'updated_at', 'updated_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'reversed_at', 'reversed_by', 'reverse_reason', 'updated_at', 'updated_by']) THEN
    RAISE EXCEPTION 'A saved payment cannot be changed. Reverse it and record it again.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER freeze_saved BEFORE UPDATE ON purch.payments FOR EACH ROW EXECUTE FUNCTION purch.freeze_payment();

CREATE TABLE purch.payment_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id bigint NOT NULL REFERENCES purch.payments,
  bill_id bigint NOT NULL REFERENCES purch.bills,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  active boolean NOT NULL DEFAULT true,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT core.actor()
);
CREATE INDEX supplier_allocations_payment ON purch.payment_allocations (payment_id);
CREATE INDEX supplier_allocations_bill ON purch.payment_allocations (bill_id);

CREATE FUNCTION purch.check_allocation() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  used bigint;
  amount bigint;
BEGIN
  SELECT p.amount_paise INTO amount FROM purch.payments p WHERE p.id = NEW.payment_id FOR UPDATE;
  SELECT coalesce(sum(amount_paise), 0) INTO used FROM purch.payment_allocations WHERE payment_id = NEW.payment_id AND active AND id IS DISTINCT FROM NEW.id;
  IF NEW.active AND used + NEW.amount_paise > amount THEN
    RAISE EXCEPTION 'This payment has only % paise left to allocate.', amount - used USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER check_allocation BEFORE INSERT OR UPDATE ON purch.payment_allocations FOR EACH ROW EXECUTE FUNCTION purch.check_allocation();

-- Purchase returns: bags sent back to the supplier, with a debit note for
-- their value (which lowers what is owed on the bill).
CREATE TABLE purch.returns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,                        -- the debit note number
  return_date date NOT NULL DEFAULT core.today_ist(),
  party_id bigint NOT NULL REFERENCES party.parties,
  bill_id bigint REFERENCES purch.bills,
  location_id integer NOT NULL REFERENCES org.locations,
  reason text NOT NULL,
  interstate boolean NOT NULL DEFAULT false,
  taxable_paise bigint NOT NULL CHECK (taxable_paise >= 0),
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor()
);
CREATE INDEX purchase_returns_party ON purch.returns (party_id, return_date);
REVOKE UPDATE ON purch.returns FROM cholan_app;

CREATE TABLE purch.return_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id bigint NOT NULL REFERENCES purch.returns,
  item_id integer NOT NULL REFERENCES catalog.items,
  batch_id bigint REFERENCES inv.batches,
  qty integer NOT NULL CHECK (qty > 0),
  rate_paise bigint NOT NULL CHECK (rate_paise >= 0),
  gst_rate_bp smallint NOT NULL,
  taxable_paise bigint NOT NULL,
  tax_paise bigint NOT NULL
);
REVOKE UPDATE ON purch.return_lines FROM cholan_app;

-- ---- What is owed to suppliers ----
CREATE VIEW purch.bill_balance AS
SELECT b.id AS bill_id, b.number, b.supplier_bill_no, b.party_id, b.bill_date, b.due_date, b.total_paise,
       coalesce(dn.debited, 0) AS debited_paise,
       coalesce(al.paid, 0) AS paid_paise,
       b.total_paise - coalesce(dn.debited, 0) - coalesce(al.paid, 0) AS balance_paise,
       greatest(core.today_ist() - b.due_date, 0) AS days_overdue
FROM purch.bills b
LEFT JOIN (SELECT bill_id, sum(total_paise)::bigint AS debited FROM purch.returns WHERE bill_id IS NOT NULL GROUP BY bill_id) dn ON dn.bill_id = b.id
LEFT JOIN (SELECT a.bill_id, sum(a.amount_paise)::bigint AS paid FROM purch.payment_allocations a JOIN purch.payments p ON p.id = a.payment_id
           WHERE a.active AND p.status = 'active' GROUP BY a.bill_id) al ON al.bill_id = b.id
WHERE b.status = 'open';

CREATE VIEW purch.payment_balance AS
SELECT p.id AS payment_id, p.number, p.party_id, p.payment_date, p.amount_paise,
       coalesce(sum(a.amount_paise) FILTER (WHERE a.active), 0)::bigint AS allocated_paise,
       (p.amount_paise - coalesce(sum(a.amount_paise) FILTER (WHERE a.active), 0))::bigint AS unallocated_paise
FROM purch.payments p LEFT JOIN purch.payment_allocations a ON a.payment_id = p.id
WHERE p.status = 'active'
GROUP BY p.id;

CREATE VIEW purch.supplier_balance AS
SELECT p.id AS party_id,
       coalesce(bb.owed, 0) AS billed_due_paise,
       coalesce(pb.advance, 0) AS advance_paise,
       coalesce(bb.owed, 0) - coalesce(pb.advance, 0) AS net_due_paise,
       coalesce(bb.overdue, 0) AS overdue_paise,
       coalesce(bb.b0_15, 0) AS due_0_15_paise,
       coalesce(bb.b16_30, 0) AS due_16_30_paise,
       coalesce(bb.b31_60, 0) AS due_31_60_paise,
       coalesce(bb.b60, 0) AS due_over_60_paise
FROM party.parties p
LEFT JOIN (
  SELECT party_id, sum(balance_paise)::bigint AS owed,
         (sum(balance_paise) FILTER (WHERE days_overdue > 0))::bigint AS overdue,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - bill_date <= 15))::bigint AS b0_15,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - bill_date BETWEEN 16 AND 30))::bigint AS b16_30,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - bill_date BETWEEN 31 AND 60))::bigint AS b31_60,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - bill_date > 60))::bigint AS b60
  FROM purch.bill_balance WHERE balance_paise <> 0 GROUP BY party_id
) bb ON bb.party_id = p.id
LEFT JOIN (SELECT party_id, sum(unallocated_paise)::bigint AS advance FROM purch.payment_balance GROUP BY party_id) pb ON pb.party_id = p.id
WHERE p.is_supplier;

-- ---- Expenses ----
CREATE SCHEMA acct;
GRANT USAGE ON SCHEMA acct TO cholan_app, cholan_read;

CREATE TABLE acct.expense_categories (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  tally_ledger text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('acct.expense_categories');
INSERT INTO acct.expense_categories (name, tally_ledger) VALUES
  ('Transport and freight', 'Freight Inward'),
  ('Loading and unloading (hamali)', 'Loading and Unloading Charges'),
  ('Electricity', 'Electricity Charges'),
  ('Rent', 'Rent'),
  ('Salaries and wages', 'Salaries and Wages'),
  ('Fuel', 'Fuel Expenses'),
  ('Repairs and maintenance', 'Repairs and Maintenance'),
  ('Packing materials', 'Packing Materials'),
  ('Office expenses', 'Office Expenses'),
  ('Telephone and internet', 'Telephone and Internet'),
  ('Bank charges', 'Bank Charges'),
  ('Other', 'Miscellaneous Expenses');

CREATE TABLE acct.expenses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  expense_date date NOT NULL,
  branch_id smallint NOT NULL REFERENCES org.branches,
  category_id smallint NOT NULL REFERENCES acct.expense_categories,
  payee_party_id bigint REFERENCES party.parties,
  payee_name text NOT NULL,
  description text NOT NULL,
  bill_no text,
  supplier_gstin text CHECK (supplier_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  taxable_paise bigint NOT NULL CHECK (taxable_paise >= 0),
  gst_rate_bp smallint NOT NULL DEFAULT 0 CHECK (gst_rate_bp BETWEEN 0 AND 4000),
  interstate boolean NOT NULL DEFAULT false,
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL CHECK (total_paise > 0),
  itc_eligible boolean NOT NULL DEFAULT false,
  paid_by text NOT NULL CHECK (paid_by IN ('cash', 'upi', 'bank', 'cheque', 'card', 'other')),
  reference text,
  photo_path text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE INDEX expenses_date ON acct.expenses (expense_date);
SELECT core.track('acct.expenses');
-- Saved once: only cancelling (and adding the bill photo) may change it.
CREATE FUNCTION acct.freeze_expense() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'This expense is cancelled and can no longer be changed.' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by', 'photo_path', 'updated_at', 'updated_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'cancel_reason', 'cancelled_at', 'cancelled_by', 'photo_path', 'updated_at', 'updated_by']) THEN
    RAISE EXCEPTION 'A saved expense cannot be changed. Cancel it and enter it again.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER freeze_saved BEFORE UPDATE ON acct.expenses FOR EACH ROW EXECUTE FUNCTION acct.freeze_expense();

-- Read-only reports account.
GRANT SELECT ON ALL TABLES IN SCHEMA purch, acct TO cholan_read;
GRANT SELECT ON inv.batches, inv.batch_stock, inv.batch_dispatches, inv.transfers, inv.transfer_lines, inv.packing_runs, inv.packing_lines, inv.stock_requests TO cholan_read;
