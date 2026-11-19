-- Phase 5: accounts and reports.
--
-- Tally: which ledger each account goes to, and export batches, so a document
-- is never sent to Tally twice (unless its batch is voided). Payment
-- reminders, logged. Report views for the read-only reports account
-- (cholan_read), for Looker Studio, Power BI or Excel.

CREATE SCHEMA tally;
GRANT USAGE ON SCHEMA tally TO cholan_app, cholan_read;

CREATE TABLE tally.ledgers (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  ledger_name text NOT NULL CHECK (length(ledger_name) <= 120),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor()
);
SELECT core.track('tally.ledgers');
INSERT INTO tally.ledgers (key, ledger_name, note) VALUES
  ('sales_taxable', 'Sales @ 5%', 'Sales of packs with GST (5%). Use {rate} to make one ledger per rate, e.g. "Sales @ {rate}%".'),
  ('sales_exempt', 'Sales Exempt', 'Sales of nil-rated or exempt packs (26 kg bags).'),
  ('sales_return', 'Sales Returns', 'Credit notes for returned bags.'),
  ('output_cgst', 'Output CGST', NULL),
  ('output_sgst', 'Output SGST', NULL),
  ('output_igst', 'Output IGST', NULL),
  ('round_off', 'Round Off', NULL),
  ('purchase_taxable', 'Purchase @ {rate}%', 'Purchases with GST. {rate} is replaced with the rate.'),
  ('purchase_exempt', 'Purchase Exempt', 'Purchases of nil-rated goods (paddy, rice in big bags).'),
  ('purchase_return', 'Purchase Returns', 'Debit notes for goods sent back.'),
  ('input_cgst', 'Input CGST', NULL),
  ('input_sgst', 'Input SGST', NULL),
  ('input_igst', 'Input IGST', NULL),
  ('cash', 'Cash', NULL),
  ('bank', 'Bank Account', 'Bank transfers, UPI, cheques and cards.'),
  ('razorpay', 'Razorpay', 'Online payments, until Razorpay settles to the bank.'),
  ('b2c_party', '', 'Leave empty to give each household its own ledger; or e.g. "Cash Sales" to put all household sales in one.');

CREATE TABLE tally.export_batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_date date NOT NULL,
  to_date date NOT NULL,
  kinds text[] NOT NULL,
  voucher_count integer NOT NULL,
  xml text NOT NULL,
  voided boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  CHECK (to_date >= from_date),
  CHECK (NOT voided OR (void_reason IS NOT NULL AND voided_at IS NOT NULL))
);
SELECT core.track('tally.export_batches');

CREATE TABLE tally.exported (
  doc_type text NOT NULL CHECK (doc_type IN ('invoice', 'credit_note', 'receipt', 'purchase_bill', 'debit_note', 'supplier_payment', 'expense')),
  doc_id bigint NOT NULL,
  batch_id bigint NOT NULL REFERENCES tally.export_batches,
  PRIMARY KEY (doc_type, doc_id, batch_id)
);
REVOKE UPDATE ON tally.exported FROM cholan_app;

-- Payment reminders sent to customers.
CREATE TABLE sales.reminders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES party.parties,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'call', 'email', 'sms', 'visit')),
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  note text,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT core.actor()
);
CREATE INDEX reminders_party ON sales.reminders (party_id, at);
REVOKE UPDATE ON sales.reminders FROM cholan_app;

-- ---- Report views (read-only reports account) ----
CREATE SCHEMA report;
GRANT USAGE ON SCHEMA report TO cholan_app, cholan_read;

CREATE VIEW report.sales_lines AS
SELECT i.invoice_date, i.number AS invoice_number, i.supply_type, i.interstate, i.place_of_supply,
       p.id AS party_id, p.display_name AS customer, cp.segment, br.code AS branch,
       il.item_id, it.sku_code, it.name AS item_name, pr.name AS product, it.pack_label, il.qty,
       il.unit_price_paise, il.gst_rate_bp, il.taxable_paise, il.cgst_paise, il.sgst_paise, il.igst_paise, il.total_paise,
       (it.net_weight_g::numeric * il.qty / 1000) AS kg
FROM sales.invoice_lines il
JOIN sales.invoices i ON i.id = il.invoice_id AND i.status = 'issued'
JOIN sales.orders o ON o.id = i.order_id
JOIN org.branches br ON br.id = o.branch_id
JOIN party.parties p ON p.id = i.party_id
LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id
JOIN catalog.items it ON it.id = il.item_id
LEFT JOIN catalog.products pr ON pr.id = it.product_id;

CREATE VIEW report.outstanding AS
SELECT pb.*, p.display_name AS customer, p.phone, cp.segment, cp.credit_limit_paise, cp.terms_days, cp.credit_status
FROM sales.party_balance pb JOIN party.parties p ON p.id = pb.party_id LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id
WHERE p.is_customer;

CREATE VIEW report.payables AS
SELECT sb.*, p.display_name AS supplier, p.phone FROM purch.supplier_balance sb JOIN party.parties p ON p.id = sb.party_id;

CREATE VIEW report.stock AS
SELECT br.code AS branch, br.name AS branch_name, l.code AS location, l.kind AS location_kind, it.sku_code, it.name AS item_name,
       it.kind AS item_kind, b.on_hand, b.reserved, b.on_hand - b.reserved AS available, b.damaged
FROM inv.stock_balances b JOIN org.locations l ON l.id = b.location_id JOIN org.branches br ON br.id = l.branch_id
JOIN catalog.items it ON it.id = b.item_id;

CREATE VIEW report.expenses AS
SELECT e.expense_date, e.number, c.name AS category, br.code AS branch, e.payee_name, e.description, e.taxable_paise,
       e.cgst_paise + e.sgst_paise + e.igst_paise AS gst_paise, e.total_paise, e.itc_eligible, e.paid_by
FROM acct.expenses e JOIN acct.expense_categories c ON c.id = e.category_id JOIN org.branches br ON br.id = e.branch_id
WHERE e.status = 'active';

GRANT SELECT ON ALL TABLES IN SCHEMA report, tally TO cholan_read;
GRANT SELECT ON sales.reminders TO cholan_read;
