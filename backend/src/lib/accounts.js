// Phase 5: accounts and reports on the business database.
//
// - GSTR-1 helper: the month's B2B, B2C large, B2C small, nil-rated and exempt,
//   credit notes, HSN summary and document summary, from the issued invoices
//   and credit notes. Rate-0 lines (26 kg bags) are treated as exempt and go
//   to the nil/exempt table; confirm with the CA.
// - GSTR-3B summary: output tax, input tax from supplier bills and expenses,
//   and the difference.
// - Tally: vouchers for sales, credit notes, receipts, purchases, debit notes,
//   supplier payments and expenses as Tally XML (TallyPrime and Tally ERP 9),
//   in batches, so nothing is exported twice.
// - Payment reminders, and sales/purchase/expense reports.
import { InputError } from './business.js';

const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const one = async (client, sql, values) => (await client.query(sql, values)).rows[0];
const all = async (client, sql, values) => (await client.query(sql, values)).rows;
const notFound = (what) => Object.assign(new Error(`${what} not found.`), { status: 404 });

function cleanDate(value, field) {
  const v = text(String(value ?? ''), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new InputError('Choose a date.', { [field]: 'Choose a date.' });
  return v;
}
// "2026-11" → the month's first and last day.
export function monthRange(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new InputError('Choose a month.', { month: 'Choose a month.' });
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}` };
}

// ---- GSTR-1 ----
export async function gstr1(client, month) {
  const { from, to } = monthRange(month);
  const lines = await all(
    client,
    `SELECT i.id, i.number, i.invoice_date, i.supply_type, i.place_of_supply, i.interstate, i.total_paise, i.buyer,
            il.hsn, il.unit, il.qty, il.gst_rate_bp, il.taxable_paise, il.cgst_paise, il.sgst_paise, il.igst_paise, il.total_paise AS line_total,
            it.net_weight_g
     FROM sales.invoices i JOIN sales.invoice_lines il ON il.invoice_id = i.id JOIN catalog.items it ON it.id = il.item_id
     WHERE i.status = 'issued' AND i.invoice_date BETWEEN $1 AND $2 ORDER BY i.invoice_date, i.number, il.line_no`,
    [from, to],
  );
  const notes = await all(
    client,
    `SELECT c.id, c.number, c.note_date, c.place_of_supply, c.interstate, c.total_paise, c.buyer, c.reason, i.number AS invoice_number, i.invoice_date,
            i.supply_type, cl.hsn, cl.qty, cl.gst_rate_bp, cl.taxable_paise, cl.cgst_paise, cl.sgst_paise, cl.igst_paise, it.net_weight_g
     FROM sales.credit_notes c JOIN sales.invoices i ON i.id = c.invoice_id JOIN sales.credit_note_lines cl ON cl.credit_note_id = c.id
     JOIN catalog.items it ON it.id = cl.item_id
     WHERE c.status = 'issued' AND c.note_date BETWEEN $1 AND $2 ORDER BY c.note_date, c.number, cl.line_no`,
    [from, to],
  );
  const key = (...parts) => parts.join('|');
  const add = (map, k, base, l, sign = 1) => {
    const row = map.get(k) || { ...base, taxable_paise: 0, igst_paise: 0, cgst_paise: 0, sgst_paise: 0 };
    row.taxable_paise += sign * l.taxable_paise;
    row.igst_paise += sign * l.igst_paise;
    row.cgst_paise += sign * l.cgst_paise;
    row.sgst_paise += sign * l.sgst_paise;
    map.set(k, row);
  };
  const b2b = new Map();
  const b2cl = new Map();
  const b2cs = new Map();
  const nil = { inter_registered: 0, intra_registered: 0, inter_unregistered: 0, intra_unregistered: 0 };
  const hsn = { b2b: new Map(), b2c: new Map() };
  const addHsn = (map, l, sign = 1) => {
    const k = key(l.hsn, l.gst_rate_bp);
    const row = map.get(k) || { hsn: l.hsn, gst_rate_bp: l.gst_rate_bp, uqc: 'KGS', qty_kg: 0, bags: 0, value_paise: 0, taxable_paise: 0, igst_paise: 0, cgst_paise: 0, sgst_paise: 0 };
    row.bags += sign * l.qty;
    row.qty_kg += sign * ((l.net_weight_g || 0) * l.qty) / 1000;
    row.value_paise += sign * (l.taxable_paise + l.igst_paise + l.cgst_paise + l.sgst_paise);
    row.taxable_paise += sign * l.taxable_paise;
    row.igst_paise += sign * l.igst_paise;
    row.cgst_paise += sign * l.cgst_paise;
    row.sgst_paise += sign * l.sgst_paise;
    map.set(k, row);
  };
  for (const l of lines) {
    const registered = l.supply_type === 'B2B';
    addHsn(registered ? hsn.b2b : hsn.b2c, l);
    if (!l.gst_rate_bp) {
      nil[`${l.interstate ? 'inter' : 'intra'}_${registered ? 'registered' : 'unregistered'}`] += l.taxable_paise;
      continue;
    }
    const inv = { gstin: l.buyer?.gstin || '', receiver: l.buyer?.name || '', invoice_number: l.number, invoice_date: l.invoice_date, invoice_value_paise: l.total_paise, place_of_supply: l.place_of_supply, gst_rate_bp: l.gst_rate_bp };
    if (l.supply_type === 'B2B') add(b2b, key(l.id, l.gst_rate_bp), { ...inv, reverse_charge: 'N', invoice_type: 'Regular B2B' }, l);
    else if (l.supply_type === 'B2CL') add(b2cl, key(l.id, l.gst_rate_bp), inv, l);
    else add(b2cs, key(l.place_of_supply, l.gst_rate_bp), { type: 'OE', place_of_supply: l.place_of_supply, gst_rate_bp: l.gst_rate_bp }, l);
  }
  const cdnr = new Map();
  const cdnur = new Map();
  for (const n of notes) {
    const registered = n.supply_type === 'B2B';
    addHsn(registered ? hsn.b2b : hsn.b2c, n, -1);
    if (!n.gst_rate_bp) {
      nil[`${n.interstate ? 'inter' : 'intra'}_${registered ? 'registered' : 'unregistered'}`] -= n.taxable_paise;
      continue;
    }
    const base = { gstin: n.buyer?.gstin || '', receiver: n.buyer?.name || '', note_number: n.number, note_date: n.note_date, note_type: 'C', note_value_paise: n.total_paise, place_of_supply: n.place_of_supply, gst_rate_bp: n.gst_rate_bp, invoice_number: n.invoice_number, invoice_date: n.invoice_date };
    if (registered) add(cdnr, key(n.id, n.gst_rate_bp), base, n);
    else if (n.supply_type === 'B2CL') add(cdnur, key(n.id, n.gst_rate_bp), { ...base, ur_type: 'B2CL' }, n);
    // A credit note on a small B2C sale lowers that month's B2C small figure.
    else add(b2cs, key(n.place_of_supply, n.gst_rate_bp), { type: 'OE', place_of_supply: n.place_of_supply, gst_rate_bp: n.gst_rate_bp }, n, -1);
  }
  const docs = await all(
    client,
    `SELECT 'Invoices for outward supply' AS nature, min(number) AS from_number, max(number) AS to_number, count(*)::int AS total,
            count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
     FROM sales.invoices WHERE invoice_date BETWEEN $1 AND $2 HAVING count(*) > 0
     UNION ALL
     SELECT 'Credit note', min(number), max(number), count(*)::int, count(*) FILTER (WHERE status = 'cancelled')::int
     FROM sales.credit_notes WHERE note_date BETWEEN $1 AND $2 HAVING count(*) > 0`,
    [from, to],
  );
  const round3 = (rows) => rows.map((r) => ({ ...r, qty_kg: Math.round(r.qty_kg * 1000) / 1000 }));
  return {
    month,
    from,
    to,
    b2b: [...b2b.values()],
    b2cl: [...b2cl.values()],
    b2cs: [...b2cs.values()].filter((r) => r.taxable_paise !== 0),
    cdnr: [...cdnr.values()],
    cdnur: [...cdnur.values()],
    nil,
    hsn_b2b: round3([...hsn.b2b.values()]),
    hsn_b2c: round3([...hsn.b2c.values()]),
    docs,
  };
}

// ---- GSTR-3B summary ----
export async function gstr3b(client, month) {
  const { from, to } = monthRange(month);
  const out = await one(
    client,
    `SELECT coalesce(sum(il.taxable_paise) FILTER (WHERE il.gst_rate_bp > 0), 0)::bigint AS taxable,
            coalesce(sum(il.taxable_paise) FILTER (WHERE il.gst_rate_bp = 0), 0)::bigint AS exempt,
            coalesce(sum(il.igst_paise), 0)::bigint AS igst, coalesce(sum(il.cgst_paise), 0)::bigint AS cgst, coalesce(sum(il.sgst_paise), 0)::bigint AS sgst
     FROM sales.invoices i JOIN sales.invoice_lines il ON il.invoice_id = i.id WHERE i.status = 'issued' AND i.invoice_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const cn = await one(
    client,
    `SELECT coalesce(sum(cl.taxable_paise) FILTER (WHERE cl.gst_rate_bp > 0), 0)::bigint AS taxable,
            coalesce(sum(cl.taxable_paise) FILTER (WHERE cl.gst_rate_bp = 0), 0)::bigint AS exempt,
            coalesce(sum(cl.igst_paise), 0)::bigint AS igst, coalesce(sum(cl.cgst_paise), 0)::bigint AS cgst, coalesce(sum(cl.sgst_paise), 0)::bigint AS sgst
     FROM sales.credit_notes c JOIN sales.credit_note_lines cl ON cl.credit_note_id = c.id WHERE c.status = 'issued' AND c.note_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const bills = await one(
    client,
    `SELECT coalesce(sum(igst_paise), 0)::bigint AS igst, coalesce(sum(cgst_paise), 0)::bigint AS cgst, coalesce(sum(sgst_paise), 0)::bigint AS sgst,
            coalesce(sum(taxable_paise), 0)::bigint AS taxable
     FROM purch.bills WHERE status = 'open' AND itc_eligible AND bill_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const exp = await one(
    client,
    `SELECT coalesce(sum(igst_paise), 0)::bigint AS igst, coalesce(sum(cgst_paise), 0)::bigint AS cgst, coalesce(sum(sgst_paise), 0)::bigint AS sgst
     FROM acct.expenses WHERE status = 'active' AND itc_eligible AND expense_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const dn = await one(
    client,
    `SELECT coalesce(sum(r.igst_paise), 0)::bigint AS igst, coalesce(sum(r.cgst_paise), 0)::bigint AS cgst, coalesce(sum(r.sgst_paise), 0)::bigint AS sgst
     FROM purch.returns r JOIN purch.bills b ON b.id = r.bill_id WHERE b.itc_eligible AND r.return_date BETWEEN $1 AND $2`,
    [from, to],
  );
  const heads = ['igst', 'cgst', 'sgst'];
  const output = Object.fromEntries(heads.map((h) => [h, out[h] - cn[h]]));
  const input = Object.fromEntries(heads.map((h) => [h, bills[h] + exp[h] - dn[h]]));
  return {
    month,
    outward: { taxable_paise: out.taxable - cn.taxable, exempt_paise: out.exempt - cn.exempt, ...Object.fromEntries(heads.map((h) => [`${h}_paise`, output[h]])) },
    itc: { ...Object.fromEntries(heads.map((h) => [`${h}_paise`, input[h]])), from_bills_paise: bills.igst + bills.cgst + bills.sgst, from_expenses_paise: exp.igst + exp.cgst + exp.sgst, reversed_debit_notes_paise: dn.igst + dn.cgst + dn.sgst },
    // Before the set-off rules (IGST credit first, and so on), which the CA applies.
    difference: Object.fromEntries(heads.map((h) => [`${h}_paise`, output[h] - input[h]])),
  };
}

// ---- Tally ----
export async function listLedgers(client) {
  return all(client, 'SELECT key, ledger_name, note FROM tally.ledgers ORDER BY key');
}
export async function setLedger(client, key, body) {
  const name = text(body.ledgerName, 120);
  if (!name && key !== 'b2c_party') throw new InputError('Enter the ledger name exactly as in Tally.', { ledgerName: 'Enter the name.' });
  const row = await one(client, 'UPDATE tally.ledgers SET ledger_name = $2 WHERE key = $1 RETURNING key', [key, name]);
  if (!row) throw notFound('Ledger');
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tdate = (d) => String(d).replaceAll('-', '');
// A ledger line: positive paise is a credit, negative a debit (Tally's own
// sign: a debit is "deemed positive" with a negative amount).
function entry(ledger, paise, bills = []) {
  if (!paise) return '';
  const amount = (paise / 100).toFixed(2);
  const allocations = bills
    .map((b) => `<BILLALLOCATIONS.LIST><NAME>${esc(b.name)}</NAME><BILLTYPE>${b.type}</BILLTYPE><AMOUNT>${(b.paise / 100).toFixed(2)}</AMOUNT></BILLALLOCATIONS.LIST>`)
    .join('');
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${paise < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amount}</AMOUNT>${allocations}</ALLLEDGERENTRIES.LIST>`;
}
function voucher({ type, date, number, party, reference, referenceDate, narration, entries }) {
  const sum = entries.reduce((s, e) => s + e.paise, 0);
  if (sum !== 0) throw new Error(`Voucher ${number} does not balance (${sum} paise).`);
  return (
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${esc(type)}" ACTION="Create" OBJVIEW="Accounting Voucher View">` +
    `<DATE>${tdate(date)}</DATE><VOUCHERTYPENAME>${esc(type)}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(number)}</VOUCHERNUMBER>` +
    (party ? `<PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME>` : '') +
    (reference ? `<REFERENCE>${esc(reference)}</REFERENCE>` : '') +
    (referenceDate ? `<REFERENCEDATE>${tdate(referenceDate)}</REFERENCEDATE>` : '') +
    `<NARRATION>${esc(narration || '')}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>` +
    entries.map((e) => entry(e.ledger, e.paise, e.bills)).join('') +
    '</VOUCHER></TALLYMESSAGE>'
  );
}
export const envelope = (company, messages) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME>` +
  `<STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${messages.join('\n')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;

export const TALLY_KINDS = ['invoice', 'credit_note', 'receipt', 'purchase_bill', 'debit_note', 'supplier_payment', 'expense'];
const NOT_EXPORTED = (type, alias) =>
  `NOT EXISTS (SELECT 1 FROM tally.exported e JOIN tally.export_batches b ON b.id = e.batch_id WHERE NOT b.voided AND e.doc_type = '${type}' AND e.doc_id = ${alias}.id)`;

async function ledgerNames(client) {
  const map = Object.fromEntries((await listLedgers(client)).map((l) => [l.key, l.ledger_name]));
  return { ...map, rate: (key, bp) => (map[key] || '').replace('{rate}', String(bp / 100)) };
}
const partyLedger = (p, L) => p.tally_ledger_name || (p.segment === 'b2c' && L.b2c_party ? L.b2c_party : p.display_name);
const moneyLedger = (method, L) => (method === 'cash' ? L.cash : method === 'razorpay' ? L.razorpay : L.bank);

// Builds the vouchers for documents dated from–to not yet in a live batch.
export async function buildVouchers(client, { from, to, kinds }) {
  const L = await ledgerNames(client);
  const out = [];
  const docs = [];
  const PARTY = `p.display_name, p.tally_ledger_name, cp.segment`;
  const PARTY_JOIN = (col) => `JOIN party.parties p ON p.id = ${col} LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id`;
  const byRate = (rows) => {
    const m = new Map();
    for (const r of rows) m.set(r.gst_rate_bp, (m.get(r.gst_rate_bp) || 0) + r.taxable_paise);
    return [...m.entries()];
  };

  if (kinds.includes('invoice')) {
    const invoices = await all(client, `SELECT i.*, ${PARTY} FROM sales.invoices i ${PARTY_JOIN('i.party_id')} WHERE i.status = 'issued' AND i.invoice_date BETWEEN $1 AND $2 AND ${NOT_EXPORTED('invoice', 'i')} ORDER BY i.invoice_date, i.id`, [from, to]);
    for (const i of invoices) {
      const lines = await all(client, 'SELECT gst_rate_bp, taxable_paise FROM sales.invoice_lines WHERE invoice_id = $1', [i.id]);
      const party = partyLedger(i, L);
      out.push(
        voucher({
          type: 'Sales',
          date: i.invoice_date,
          number: i.number,
          party,
          narration: `Order invoice ${i.number}`,
          entries: [
            { ledger: party, paise: -i.total_paise, bills: [{ name: i.number, type: 'New Ref', paise: -i.total_paise }] },
            ...byRate(lines).map(([bp, paise]) => ({ ledger: bp ? L.rate('sales_taxable', bp) : L.sales_exempt, paise })),
            { ledger: L.output_cgst, paise: i.cgst_paise },
            { ledger: L.output_sgst, paise: i.sgst_paise },
            { ledger: L.output_igst, paise: i.igst_paise },
            { ledger: L.round_off, paise: i.round_off_paise },
          ],
        }),
      );
      docs.push(['invoice', i.id]);
    }
  }
  if (kinds.includes('credit_note')) {
    const notes = await all(
      client,
      `SELECT c.*, i.number AS invoice_number, ${PARTY} FROM sales.credit_notes c JOIN sales.invoices i ON i.id = c.invoice_id ${PARTY_JOIN('c.party_id')}
       WHERE c.status = 'issued' AND c.note_date BETWEEN $1 AND $2 AND ${NOT_EXPORTED('credit_note', 'c')} ORDER BY c.note_date, c.id`,
      [from, to],
    );
    for (const c of notes) {
      const party = partyLedger(c, L);
      out.push(
        voucher({
          type: 'Credit Note',
          date: c.note_date,
          number: c.number,
          party,
          reference: c.invoice_number,
          narration: `Against invoice ${c.invoice_number} (${c.reason})`,
          entries: [
            { ledger: party, paise: c.total_paise, bills: [{ name: c.invoice_number, type: 'Agst Ref', paise: c.total_paise }] },
            { ledger: L.sales_return, paise: -(c.taxable_paise + c.exempt_paise) },
            { ledger: L.output_cgst, paise: -c.cgst_paise },
            { ledger: L.output_sgst, paise: -c.sgst_paise },
            { ledger: L.output_igst, paise: -c.igst_paise },
            { ledger: L.round_off, paise: -c.round_off_paise },
          ],
        }),
      );
      docs.push(['credit_note', c.id]);
    }
  }
  if (kinds.includes('receipt')) {
    const receipts = await all(client, `SELECT r.*, ${PARTY} FROM sales.receipts r ${PARTY_JOIN('r.party_id')} WHERE r.status = 'active' AND r.receipt_date BETWEEN $1 AND $2 AND ${NOT_EXPORTED('receipt', 'r')} ORDER BY r.receipt_date, r.id`, [from, to]);
    for (const r of receipts) {
      const allocs = await all(client, 'SELECT i.number, a.amount_paise FROM sales.receipt_allocations a JOIN sales.invoices i ON i.id = a.invoice_id WHERE a.receipt_id = $1 AND a.active', [r.id]);
      const left = r.amount_paise - allocs.reduce((s, a) => s + a.amount_paise, 0);
      const party = partyLedger(r, L);
      out.push(
        voucher({
          type: 'Receipt',
          date: r.receipt_date,
          number: r.number,
          party,
          narration: [r.method.toUpperCase(), r.reference, r.notes].filter(Boolean).join(' · '),
          entries: [
            { ledger: moneyLedger(r.method, L), paise: -r.amount_paise },
            { ledger: party, paise: r.amount_paise, bills: [...allocs.map((a) => ({ name: a.number, type: 'Agst Ref', paise: a.amount_paise })), ...(left > 0 ? [{ name: r.number, type: 'Advance', paise: left }] : [])] },
          ],
        }),
      );
      docs.push(['receipt', r.id]);
    }
  }
  if (kinds.includes('purchase_bill')) {
    const bills = await all(client, `SELECT b.*, ${PARTY} FROM purch.bills b ${PARTY_JOIN('b.party_id')} WHERE b.status = 'open' AND b.bill_date BETWEEN $1 AND $2 AND ${NOT_EXPORTED('purchase_bill', 'b')} ORDER BY b.bill_date, b.id`, [from, to]);
    for (const b of bills) {
      const lines = await all(client, 'SELECT gst_rate_bp, taxable_paise FROM purch.bill_lines WHERE bill_id = $1', [b.id]);
      const party = partyLedger(b, L);
      out.push(
        voucher({
          type: 'Purchase',
          date: b.bill_date,
          number: b.number,
          party,
          reference: b.supplier_bill_no,
          referenceDate: b.bill_date,
          narration: `Supplier bill ${b.supplier_bill_no}`,
          entries: [
            { ledger: party, paise: b.total_paise, bills: [{ name: b.supplier_bill_no, type: 'New Ref', paise: b.total_paise }] },
            ...byRate(lines).map(([bp, paise]) => ({ ledger: bp ? L.rate('purchase_taxable', bp) : L.purchase_exempt, paise: -paise })),
            { ledger: L.input_cgst, paise: -b.cgst_paise },
            { ledger: L.input_sgst, paise: -b.sgst_paise },
            { ledger: L.input_igst, paise: -b.igst_paise },
            { ledger: L.round_off, paise: -b.round_off_paise },
          ],
        }),
      );
      docs.push(['purchase_bill', b.id]);
    }
  }
  if (kinds.includes('debit_note')) {
    const returns = await all(
      client,
      `SELECT r.*, b.supplier_bill_no, ${PARTY} FROM purch.returns r LEFT JOIN purch.bills b ON b.id = r.bill_id ${PARTY_JOIN('r.party_id')}
       WHERE r.return_date BETWEEN $1 AND $2 AND ${NOT_EXPORTED('debit_note', 'r')} ORDER BY r.return_date, r.id`,
      [from, to],
    );
    for (const r of returns) {
      const party = partyLedger(r, L);
      out.push(
        voucher({
          type: 'Debit Note',
          date: r.return_date,
          number: r.number,
          party,
          reference: r.supplier_bill_no,
          narration: `Goods returned: ${r.reason}`,
          entries: [
            { ledger: party, paise: -r.total_paise, bills: r.supplier_bill_no ? [{ name: r.supplier_bill_no, type: 'Agst Ref', paise: -r.total_paise }] : [] },
            { ledger: L.purchase_return, paise: r.taxable_paise },
            { ledger: L.input_cgst, paise: r.cgst_paise },
            { ledger: L.input_sgst, paise: r.sgst_paise },
            { ledger: L.input_igst, paise: r.igst_paise },
          ],
        }),
      );
      docs.push(['debit_note', r.id]);
    }
  }
  if (kinds.includes('supplier_payment')) {
    const payments = await all(client, `SELECT pm.*, ${PARTY} FROM purch.payments pm ${PARTY_JOIN('pm.party_id')} WHERE pm.status = 'active' AND pm.payment_date BETWEEN $1 AND $2 AND ${NOT_EXPORTED('supplier_payment', 'pm')} ORDER BY pm.payment_date, pm.id`, [from, to]);
    for (const pm of payments) {
      const allocs = await all(client, 'SELECT b.supplier_bill_no, a.amount_paise FROM purch.payment_allocations a JOIN purch.bills b ON b.id = a.bill_id WHERE a.payment_id = $1 AND a.active', [pm.id]);
      const left = pm.amount_paise - allocs.reduce((s, a) => s + a.amount_paise, 0);
      const party = partyLedger(pm, L);
      out.push(
        voucher({
          type: 'Payment',
          date: pm.payment_date,
          number: pm.number,
          party,
          narration: [pm.method.toUpperCase(), pm.reference, pm.notes].filter(Boolean).join(' · '),
          entries: [
            { ledger: party, paise: -pm.amount_paise, bills: [...allocs.map((a) => ({ name: a.supplier_bill_no, type: 'Agst Ref', paise: -a.amount_paise })), ...(left > 0 ? [{ name: pm.number, type: 'Advance', paise: -left }] : [])] },
            { ledger: moneyLedger(pm.method, L), paise: pm.amount_paise },
          ],
        }),
      );
      docs.push(['supplier_payment', pm.id]);
    }
  }
  if (kinds.includes('expense')) {
    const expenses = await all(
      client,
      `SELECT e.*, c.name AS category, c.tally_ledger FROM acct.expenses e JOIN acct.expense_categories c ON c.id = e.category_id
       WHERE e.status = 'active' AND e.expense_date BETWEEN $1 AND $2 AND ${NOT_EXPORTED('expense', 'e')} ORDER BY e.expense_date, e.id`,
      [from, to],
    );
    for (const e of expenses) {
      const tax = e.cgst_paise + e.sgst_paise + e.igst_paise;
      out.push(
        voucher({
          type: 'Payment',
          date: e.expense_date,
          number: e.number,
          reference: e.bill_no,
          narration: `${e.payee_name}: ${e.description}`,
          entries: [
            { ledger: e.tally_ledger || e.category, paise: -(e.itc_eligible ? e.taxable_paise : e.total_paise) },
            ...(e.itc_eligible ? [{ ledger: L.input_cgst, paise: -e.cgst_paise }, { ledger: L.input_sgst, paise: -e.sgst_paise }, { ledger: L.input_igst, paise: -e.igst_paise }] : []),
            { ledger: moneyLedger(e.paid_by, L), paise: e.itc_eligible ? e.taxable_paise + tax : e.total_paise },
          ],
        }),
      );
      docs.push(['expense', e.id]);
    }
  }
  return { messages: out, docs };
}

export async function exportToTally(client, body) {
  const from = cleanDate(body.from, 'from');
  const to = cleanDate(body.to, 'to');
  if (to < from) throw new InputError('The end date is before the start date.', { to: 'After the start date.' });
  const kinds = (Array.isArray(body.kinds) && body.kinds.length ? body.kinds : TALLY_KINDS).filter((k) => TALLY_KINDS.includes(k));
  if (!kinds.length) throw new InputError('Choose what to export.');
  // One export at a time, so two people can't export the same documents.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('tally-export'))");
  const { messages, docs } = await buildVouchers(client, { from, to, kinds });
  if (!messages.length) throw new InputError('Nothing new to export for those dates: everything is already in an earlier export.');
  const company = (await one(client, 'SELECT legal_name FROM org.company WHERE id = 1'))?.legal_name || 'Company';
  const xml = envelope(company, messages);
  const batch = await one(client, 'INSERT INTO tally.export_batches (from_date, to_date, kinds, voucher_count, xml) VALUES ($1, $2, $3, $4, $5) RETURNING id', [from, to, kinds, messages.length, xml]);
  for (const [type, id] of docs) await client.query('INSERT INTO tally.exported (doc_type, doc_id, batch_id) VALUES ($1, $2, $3)', [type, id, batch.id]);
  return batch.id;
}

export async function listExports(client) {
  return all(
    client,
    `SELECT b.id, b.from_date, b.to_date, b.kinds, b.voucher_count, b.voided, b.void_reason, b.created_at, b.created_by,
            (SELECT count(*)::int FROM tally.exported e JOIN sales.invoices i ON e.doc_type = 'invoice' AND i.id = e.doc_id AND i.status = 'cancelled' WHERE e.batch_id = b.id) AS cancelled_since
     FROM tally.export_batches b ORDER BY b.id DESC LIMIT 100`,
  );
}
export async function exportXml(client, id) {
  const b = await one(client, 'SELECT id, from_date, to_date, xml FROM tally.export_batches WHERE id = $1', [id]);
  if (!b) throw notFound('Export');
  return b;
}
export async function voidExport(client, id, body) {
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Say why (e.g. "Tally import failed"). Its documents can then be exported again.', { reason: 'Give a reason.' });
  const row = await one(client, 'UPDATE tally.export_batches SET voided = true, voided_at = now(), voided_by = core.actor(), void_reason = $2 WHERE id = $1 AND NOT voided RETURNING id', [id, reason]);
  if (!row) throw new InputError('This export is not found or already voided.');
}

// Party ledgers (Sundry Debtors and Creditors) to create in Tally, as masters.
export async function partyMastersXml(client) {
  const L = await ledgerNames(client);
  const parties = await all(
    client,
    `SELECT p.display_name, p.tally_ledger_name, p.gstin, p.is_customer, p.is_supplier, cp.segment,
            (SELECT a.state_code FROM party.addresses a WHERE a.party_id = p.id AND a.active ORDER BY a.is_default DESC, a.id LIMIT 1) AS state_code
     FROM party.parties p LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id WHERE p.active ORDER BY p.display_name`,
  );
  const seen = new Set();
  const msgs = [];
  for (const p of parties) {
    const name = partyLedger(p, L);
    if (seen.has(name)) continue;
    seen.add(name);
    msgs.push(
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${esc(name)}" ACTION="Create"><NAME>${esc(name)}</NAME><PARENT>${p.is_customer ? 'Sundry Debtors' : 'Sundry Creditors'}</PARENT>` +
        `<ISBILLWISEON>Yes</ISBILLWISEON>${p.gstin ? `<PARTYGSTIN>${esc(p.gstin)}</PARTYGSTIN><GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>` : '<GSTREGISTRATIONTYPE>Unregistered/Consumer</GSTREGISTRATIONTYPE>'}` +
        `</LEDGER></TALLYMESSAGE>`,
    );
  }
  const company = (await one(client, 'SELECT legal_name FROM org.company WHERE id = 1'))?.legal_name || 'Company';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${msgs.join('\n')}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
}

// ---- Payment reminders ----
export async function overdueCustomers(client) {
  return all(
    client,
    `SELECT pb.party_id, pb.net_due_paise, pb.overdue_paise, pb.overdue_invoices, pb.oldest_overdue_days, p.display_name AS customer, p.phone, cp.terms_days,
            r.at AS last_reminder_at, r.channel AS last_channel, r.actor AS last_actor,
            (SELECT count(*)::int FROM sales.reminders x WHERE x.party_id = pb.party_id) AS reminders
     FROM sales.party_balance pb JOIN party.parties p ON p.id = pb.party_id LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id
     LEFT JOIN LATERAL (SELECT at, channel, actor FROM sales.reminders WHERE party_id = pb.party_id ORDER BY at DESC LIMIT 1) r ON true
     WHERE p.is_customer AND pb.overdue_paise > 0 ORDER BY pb.oldest_overdue_days DESC, pb.overdue_paise DESC`,
  );
}
export async function reminderText(client, partyId) {
  const p = await one(client, 'SELECT display_name FROM party.parties WHERE id = $1', [partyId]);
  if (!p) throw notFound('Customer');
  const invoices = await all(client, 'SELECT number, invoice_date, balance_paise, days_overdue FROM sales.invoice_balance WHERE party_id = $1 AND balance_paise > 0 AND days_overdue > 0 ORDER BY invoice_date', [partyId]);
  const total = invoices.reduce((s, i) => s + i.balance_paise, 0);
  const r = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const list = invoices.map((i) => `• ${i.number} (${i.invoice_date}): ${r(i.balance_paise)}, ${i.days_overdue} days overdue`).join('\n');
  return {
    total_paise: total,
    message: `Dear ${p.display_name},\n\nA gentle reminder from Cholan Rice: ${r(total)} is overdue on these invoices:\n${list}\n\nPlease pay at your earliest convenience. If you have already paid, kindly share the payment reference. Thank you!\n\nCholan Rice and Millet Shop`,
  };
}
export async function logReminder(client, partyId, body) {
  if (!['whatsapp', 'call', 'email', 'sms', 'visit'].includes(body.channel)) throw new InputError('Choose how you reminded them.', { channel: 'Choose one.' });
  const due = await one(client, 'SELECT overdue_paise FROM sales.party_balance WHERE party_id = $1', [partyId]);
  if (!due) throw notFound('Customer');
  await client.query('INSERT INTO sales.reminders (party_id, channel, amount_paise, note) VALUES ($1, $2, $3, $4)', [partyId, body.channel, due.overdue_paise, text(body.note, 300) || null]);
}
export async function remindersFor(client, partyId) {
  return all(client, 'SELECT * FROM sales.reminders WHERE party_id = $1 ORDER BY at DESC LIMIT 50', [partyId]);
}

// ---- Reports ----
export async function businessReport(client, body) {
  const from = cleanDate(body.from, 'from');
  const to = cleanDate(body.to, 'to');
  const q = (sql) => all(client, sql, [from, to]);
  const [byDay, byProduct, bySegment, byBranch, purchases, expenses, collections] = await Promise.all([
    q(`SELECT invoice_date AS day, count(DISTINCT invoice_number)::int AS invoices, sum(qty)::int AS bags, sum(kg)::numeric(14,1) AS kg,
              sum(taxable_paise)::bigint AS taxable_paise, sum(total_paise)::bigint AS total_paise
       FROM report.sales_lines WHERE invoice_date BETWEEN $1 AND $2 GROUP BY invoice_date ORDER BY invoice_date`),
    q(`SELECT coalesce(product, item_name) AS product, pack_label, sum(qty)::int AS bags, sum(kg)::numeric(14,1) AS kg, sum(total_paise)::bigint AS total_paise
       FROM report.sales_lines WHERE invoice_date BETWEEN $1 AND $2 GROUP BY 1, 2 ORDER BY 5 DESC`),
    q(`SELECT coalesce(segment, 'other') AS segment, count(DISTINCT party_id)::int AS customers, sum(total_paise)::bigint AS total_paise
       FROM report.sales_lines WHERE invoice_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`),
    q(`SELECT branch, sum(total_paise)::bigint AS total_paise FROM report.sales_lines WHERE invoice_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT count(*)::int AS bills, coalesce(sum(taxable_paise), 0)::bigint AS taxable_paise, coalesce(sum(total_paise), 0)::bigint AS total_paise
       FROM purch.bills WHERE status = 'open' AND bill_date BETWEEN $1 AND $2`),
    q(`SELECT category, count(*)::int AS entries, sum(total_paise)::bigint AS total_paise FROM report.expenses WHERE expense_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`),
    q(`SELECT method, count(*)::int AS receipts, sum(amount_paise)::bigint AS amount_paise FROM sales.receipts WHERE status = 'active' AND receipt_date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 3 DESC`),
  ]);
  const sum = (rows, k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  return {
    from,
    to,
    totals: {
      sales_paise: sum(byDay, 'total_paise'),
      sales_taxable_paise: sum(byDay, 'taxable_paise'),
      bags: sum(byDay, 'bags'),
      purchases_paise: purchases[0]?.total_paise || 0,
      expenses_paise: sum(expenses, 'total_paise'),
      collected_paise: sum(collections, 'amount_paise'),
    },
    byDay,
    byProduct,
    bySegment,
    byBranch,
    expenses,
    collections,
  };
}
