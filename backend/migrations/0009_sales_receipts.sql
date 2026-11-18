-- Selling, part 3: money received, matched to invoices, and what each
-- customer owes. A receipt is never deleted: a mistake is reversed, with the
-- reason kept, and its allocations stop counting.

CREATE TABLE sales.receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE,
  receipt_date date NOT NULL DEFAULT core.today_ist(),
  party_id bigint NOT NULL REFERENCES party.parties,
  method text NOT NULL CHECK (method IN ('cash', 'upi', 'bank', 'cheque', 'card', 'razorpay', 'other')),
  reference text,                                   -- UTR, cheque no., Razorpay payment id
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
CREATE INDEX receipts_party ON sales.receipts (party_id, receipt_date);
SELECT core.track('sales.receipts');

-- Only reversing may change a receipt once saved.
CREATE FUNCTION sales.freeze_receipt() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'reversed' THEN
    RAISE EXCEPTION 'This receipt is reversed and can no longer be changed.' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'reversed_at', 'reversed_by', 'reverse_reason', 'updated_at', 'updated_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'reversed_at', 'reversed_by', 'reverse_reason', 'updated_at', 'updated_by']) THEN
    RAISE EXCEPTION 'A saved receipt cannot be changed. Reverse it and record it again.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER freeze_saved BEFORE UPDATE ON sales.receipts FOR EACH ROW EXECUTE FUNCTION sales.freeze_receipt();

CREATE TABLE sales.receipt_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  receipt_id bigint NOT NULL REFERENCES sales.receipts,
  invoice_id bigint NOT NULL REFERENCES sales.invoices,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  active boolean NOT NULL DEFAULT true,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL DEFAULT core.actor()
);
CREATE INDEX receipt_allocations_receipt ON sales.receipt_allocations (receipt_id);
CREATE INDEX receipt_allocations_invoice ON sales.receipt_allocations (invoice_id);

-- A receipt can never be spread over more than it brought in.
CREATE FUNCTION sales.check_allocation() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  used bigint;
  amount bigint;
BEGIN
  SELECT r.amount_paise INTO amount FROM sales.receipts r WHERE r.id = NEW.receipt_id FOR UPDATE;
  SELECT coalesce(sum(amount_paise), 0) INTO used FROM sales.receipt_allocations WHERE receipt_id = NEW.receipt_id AND active AND id IS DISTINCT FROM NEW.id;
  IF NEW.active AND used + NEW.amount_paise > amount THEN
    RAISE EXCEPTION 'This receipt has only % paise left to allocate.', amount - used USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER check_allocation BEFORE INSERT OR UPDATE ON sales.receipt_allocations FOR EACH ROW EXECUTE FUNCTION sales.check_allocation();

-- ---- What is owed ----
-- Each issued invoice: total, credited by credit notes, paid, and the rest.
CREATE VIEW sales.invoice_balance AS
SELECT i.id AS invoice_id, i.number, i.party_id, i.invoice_date, i.due_date, i.total_paise,
       coalesce(cn.credited, 0) AS credited_paise,
       coalesce(al.paid, 0) AS paid_paise,
       i.total_paise - coalesce(cn.credited, 0) - coalesce(al.paid, 0) AS balance_paise,
       greatest(core.today_ist() - i.due_date, 0) AS days_overdue
FROM sales.invoices i
LEFT JOIN (SELECT invoice_id, sum(total_paise)::bigint AS credited FROM sales.credit_notes WHERE status = 'issued' GROUP BY invoice_id) cn ON cn.invoice_id = i.id
LEFT JOIN (SELECT a.invoice_id, sum(a.amount_paise)::bigint AS paid FROM sales.receipt_allocations a JOIN sales.receipts r ON r.id = a.receipt_id
           WHERE a.active AND r.status = 'active' GROUP BY a.invoice_id) al ON al.invoice_id = i.id
WHERE i.status = 'issued';

-- Money received but not yet matched to an invoice (an advance).
CREATE VIEW sales.receipt_balance AS
SELECT r.id AS receipt_id, r.number, r.party_id, r.receipt_date, r.amount_paise,
       coalesce(sum(a.amount_paise) FILTER (WHERE a.active), 0)::bigint AS allocated_paise,
       (r.amount_paise - coalesce(sum(a.amount_paise) FILTER (WHERE a.active), 0))::bigint AS unallocated_paise
FROM sales.receipts r LEFT JOIN sales.receipt_allocations a ON a.receipt_id = r.id
WHERE r.status = 'active'
GROUP BY r.id;

-- Per customer: owed on invoices, advances, orders not yet invoiced, overdue,
-- and the ageing buckets.
CREATE VIEW sales.party_balance AS
SELECT p.id AS party_id,
       coalesce(ib.owed, 0) AS invoiced_due_paise,
       coalesce(rb.advance, 0) AS advance_paise,
       coalesce(ib.owed, 0) - coalesce(rb.advance, 0) AS net_due_paise,
       coalesce(oo.open_value, 0) AS open_orders_paise,
       coalesce(ib.overdue, 0) AS overdue_paise,
       coalesce(ib.overdue_count, 0) AS overdue_invoices,
       coalesce(ib.oldest_overdue_days, 0) AS oldest_overdue_days,
       coalesce(ib.b0_15, 0) AS due_0_15_paise,
       coalesce(ib.b16_30, 0) AS due_16_30_paise,
       coalesce(ib.b31_60, 0) AS due_31_60_paise,
       coalesce(ib.b60, 0) AS due_over_60_paise
FROM party.parties p
LEFT JOIN (
  SELECT party_id, sum(balance_paise)::bigint AS owed,
         (sum(balance_paise) FILTER (WHERE days_overdue > 0))::bigint AS overdue,
         count(*) FILTER (WHERE days_overdue > 0 AND balance_paise > 0) AS overdue_count,
         max(days_overdue) FILTER (WHERE balance_paise > 0) AS oldest_overdue_days,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - invoice_date <= 15))::bigint AS b0_15,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - invoice_date BETWEEN 16 AND 30))::bigint AS b16_30,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - invoice_date BETWEEN 31 AND 60))::bigint AS b31_60,
         (sum(balance_paise) FILTER (WHERE core.today_ist() - invoice_date > 60))::bigint AS b60
  FROM sales.invoice_balance WHERE balance_paise <> 0 GROUP BY party_id
) ib ON ib.party_id = p.id
LEFT JOIN (SELECT party_id, sum(unallocated_paise)::bigint AS advance FROM sales.receipt_balance GROUP BY party_id) rb ON rb.party_id = p.id
LEFT JOIN (
  SELECT o.party_id, sum(o.subtotal_paise)::bigint AS open_value FROM sales.orders o
  WHERE o.status IN ('confirmed', 'packing', 'packed', 'dispatched', 'delivered')
    AND NOT EXISTS (SELECT 1 FROM sales.invoices i WHERE i.order_id = o.id AND i.status = 'issued')
  GROUP BY o.party_id
) oo ON oo.party_id = p.id;
