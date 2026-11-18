-- Selling, part 2: GST invoices, returns and credit notes.
--
-- An invoice is frozen when issued: seller, buyer, lines, rates and totals are
-- copied onto it, so a later price or address change never alters it. It is
-- never deleted; a wrong one is cancelled with its reason and the number is
-- not reused. Bags that come back are a return, with a credit note against
-- the invoice for what was returned.

CREATE TABLE sales.invoices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL CHECK (length(number) <= 16),          -- the GST limit
  gst_registration_id smallint NOT NULL REFERENCES org.gst_registrations,
  fy text NOT NULL,
  invoice_date date NOT NULL,
  order_id bigint NOT NULL REFERENCES sales.orders,
  party_id bigint NOT NULL REFERENCES party.parties,
  doc_type text NOT NULL CHECK (doc_type IN ('tax_invoice', 'bill_of_supply', 'invoice_cum_bos')),
  supply_type text NOT NULL CHECK (supply_type IN ('B2B', 'B2CS', 'B2CL')),
  seller jsonb NOT NULL,
  buyer jsonb NOT NULL,
  ship_to jsonb,
  place_of_supply char(2) NOT NULL,
  interstate boolean NOT NULL,
  includes_gst boolean NOT NULL,
  taxable_paise bigint NOT NULL,                              -- value of the 5% (etc.) lines before tax
  exempt_paise bigint NOT NULL DEFAULT 0,                     -- value of nil-rated lines
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  round_off_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  amount_in_words text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  irn text,                                                   -- e-invoicing, when it applies
  ack_no text,
  ack_date timestamptz,
  signed_qr text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE (gst_registration_id, fy, number),
  CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE UNIQUE INDEX invoices_one_live_per_order ON sales.invoices (order_id) WHERE status = 'issued';
CREATE INDEX invoices_party ON sales.invoices (party_id, invoice_date);
CREATE INDEX invoices_date ON sales.invoices (invoice_date);
SELECT core.track('sales.invoices');

CREATE TABLE sales.invoice_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id bigint NOT NULL REFERENCES sales.invoices,
  line_no smallint NOT NULL,
  order_line_id bigint REFERENCES sales.order_lines,
  item_id integer NOT NULL REFERENCES catalog.items,
  description text NOT NULL,
  hsn text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit text NOT NULL DEFAULT 'BAG',
  unit_price_paise bigint NOT NULL,
  gst_rate_bp smallint NOT NULL,
  taxable_paise bigint NOT NULL,
  cgst_paise bigint NOT NULL,
  sgst_paise bigint NOT NULL,
  igst_paise bigint NOT NULL,
  total_paise bigint NOT NULL,
  UNIQUE (invoice_id, line_no)
);
REVOKE UPDATE ON sales.invoice_lines FROM cholan_app;

-- Once issued, only cancelling (and the e-invoice numbers) may change.
CREATE FUNCTION sales.freeze_document() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed text[] := ARRAY['status', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'irn', 'ack_no', 'ack_date', 'signed_qr', 'updated_at', 'updated_by'];
  k text;
BEGIN
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'This document is cancelled and can no longer be changed.' USING ERRCODE = 'check_violation';
  END IF;
  FOR k IN SELECT key FROM jsonb_each(to_jsonb(NEW)) LOOP
    IF NOT k = ANY (allowed) AND (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k) THEN
      RAISE EXCEPTION 'An issued document cannot be changed (%). Cancel it and issue a new one.', k USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
CREATE TRIGGER freeze_issued BEFORE UPDATE ON sales.invoices FOR EACH ROW EXECUTE FUNCTION sales.freeze_document();

-- ---- Returns ----
CREATE TABLE sales.returns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES sales.orders,
  return_date date NOT NULL DEFAULT core.today_ist(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor()
);
CREATE INDEX returns_order ON sales.returns (order_id);
REVOKE UPDATE ON sales.returns FROM cholan_app;

CREATE TABLE sales.return_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  return_id bigint NOT NULL REFERENCES sales.returns,
  order_line_id bigint NOT NULL REFERENCES sales.order_lines,
  item_id integer NOT NULL REFERENCES catalog.items,
  qty integer NOT NULL CHECK (qty > 0),
  condition text NOT NULL CHECK (condition IN ('good', 'damaged'))
);
REVOKE UPDATE ON sales.return_lines FROM cholan_app;

-- ---- Credit notes ----
CREATE TABLE sales.credit_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL CHECK (length(number) <= 16),
  gst_registration_id smallint NOT NULL REFERENCES org.gst_registrations,
  fy text NOT NULL,
  note_date date NOT NULL,
  invoice_id bigint NOT NULL REFERENCES sales.invoices,
  party_id bigint NOT NULL REFERENCES party.parties,
  return_id bigint REFERENCES sales.returns,
  reason text NOT NULL CHECK (reason IN ('return', 'damage', 'rate_difference', 'discount', 'other')),
  seller jsonb NOT NULL,
  buyer jsonb NOT NULL,
  place_of_supply char(2) NOT NULL,
  interstate boolean NOT NULL,
  taxable_paise bigint NOT NULL,
  exempt_paise bigint NOT NULL DEFAULT 0,
  cgst_paise bigint NOT NULL DEFAULT 0,
  sgst_paise bigint NOT NULL DEFAULT 0,
  igst_paise bigint NOT NULL DEFAULT 0,
  round_off_paise bigint NOT NULL DEFAULT 0,
  total_paise bigint NOT NULL CHECK (total_paise >= 0),
  amount_in_words text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  irn text,
  ack_no text,
  ack_date timestamptz,
  signed_qr text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT core.actor(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT core.actor(),
  UNIQUE (gst_registration_id, fy, number)
);
CREATE INDEX credit_notes_invoice ON sales.credit_notes (invoice_id);
SELECT core.track('sales.credit_notes');
CREATE TRIGGER freeze_issued BEFORE UPDATE ON sales.credit_notes FOR EACH ROW EXECUTE FUNCTION sales.freeze_document();

CREATE TABLE sales.credit_note_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  credit_note_id bigint NOT NULL REFERENCES sales.credit_notes,
  line_no smallint NOT NULL,
  invoice_line_id bigint REFERENCES sales.invoice_lines,
  item_id integer NOT NULL REFERENCES catalog.items,
  description text NOT NULL,
  hsn text NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  unit_price_paise bigint NOT NULL,
  gst_rate_bp smallint NOT NULL,
  taxable_paise bigint NOT NULL,
  cgst_paise bigint NOT NULL,
  sgst_paise bigint NOT NULL,
  igst_paise bigint NOT NULL,
  total_paise bigint NOT NULL,
  UNIQUE (credit_note_id, line_no)
);
REVOKE UPDATE ON sales.credit_note_lines FROM cholan_app;
