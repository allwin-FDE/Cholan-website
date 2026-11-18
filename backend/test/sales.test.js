// npm run test:db — selling on the business database: orders, stock, GST
// invoices, returns and credit notes, payments and credit control, on a fresh
// throwaway database on the local test server. Skipped without DEV_DB_ADMIN_URL.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../scripts/seed-reference.js';
import '../src/db/pool.js';
import { friendly, saveParty } from '../src/lib/business.js';
import {
  adjustStock,
  cancelInvoice,
  createInvoice,
  createOrder,
  createReceipt,
  getInvoice,
  getOrder,
  moveOrder,
  partyAccount,
  recordReturn,
  reverseReceipt,
  setSeries,
} from '../src/lib/sales.js';

const ADMIN = process.env.DEV_DB_ADMIN_URL;
const name = `cholan_sales_${process.pid}`;
const urlFor = (url, database) => Object.assign(new URL(url), { pathname: `/${database}` }).href;

describe('selling', { skip: !ADMIN && 'DEV_DB_ADMIN_URL is not set' }, () => {
  let admin;
  let owner;
  let app;
  const sku = {};
  let hotel;
  let fy;

  // One website transaction as a named person (like db/pool.js withTx).
  const as = async (actor, fn) => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor', $1, true)", [actor]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw friendly(error);
    } finally {
      client.release();
    }
  };
  const staff = (fn) => as('staff@cholanrice.in', fn);
  const boss = (fn) => as('owner@cholanrice.in', fn);
  const stockOf = async (code) =>
    (await app.query('SELECT on_hand, reserved, damaged FROM inv.stock_balances b JOIN catalog.items i ON i.id = b.item_id WHERE i.sku_code = $1', [code])).rows[0];
  const order = (partyId, lines) => staff((c) => createOrder(c, { partyId, lines: lines.map(([code, qty]) => ({ itemId: sku[code], qty })) }, { canSetPrice: false }));

  before(async () => {
    admin = new pg.Pool({ connectionString: ADMIN, max: 1 });
    await admin.query(`CREATE DATABASE ${name} OWNER cholan_owner`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${name} TO cholan_owner, cholan_app, cholan_read`);
    owner = new pg.Pool({ connectionString: urlFor(process.env.MIGRATE_DATABASE_URL, name), max: 2 });
    app = new pg.Pool({ connectionString: urlFor(process.env.DATABASE_URL, name), max: 25 });
    await migrate(owner, { log: () => {} });
    await seed(owner, { log: () => {} });
    for (const r of (await app.query('SELECT id, sku_code FROM catalog.items')).rows) sku[r.sku_code] = r.id;
    fy = (await app.query('SELECT core.fy(core.today_ist()) AS fy')).rows[0].fy;
    for (const [code, qty] of [['CPR-26KG', 10], ['CPR-5KG', 50], ['KTM-26KG', 5], ['KAR-26KG', 40]]) {
      await boss((c) => adjustStock(c, { itemId: sku[code], kind: 'opening', qty }));
    }
    hotel = await boss((c) =>
      saveParty(c, null, {
        kind: 'business',
        displayName: 'Annapoorna Hotel',
        isCustomer: true,
        customer: { segment: 'hotel', creditLimit: '50000', termsDays: 15 },
        address: { line1: '12 Avinashi Road', city: 'Coimbatore', stateCode: '33', pincode: '641018' },
      }),
    );
  });

  after(async () => {
    await owner?.end();
    await app?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin?.end();
  });

  test('an order goes from new to delivered, with stock, a GST invoice and the right money', async () => {
    const id = await order(hotel.id, [['CPR-26KG', 2], ['CPR-5KG', 3]]);
    let o = await staff((c) => getOrder(c, id));
    assert.equal(o.status, 'new');
    assert.equal(o.subtotal_paise, 2 * 250000 + 3 * 52000);
    assert.deepEqual(o.lines.map((l) => l.price_source), ['list:WEB', 'list:WEB']); // the hotel list is empty, so the website price

    await staff((c) => moveOrder(c, id, 'confirmed', {}, { isAdmin: false }));
    assert.deepEqual(await stockOf('CPR-26KG'), { on_hand: 10, reserved: 2, damaged: 0 });

    await staff((c) => moveOrder(c, id, 'packing', {}, { isAdmin: false }));
    await staff((c) => moveOrder(c, id, 'packed', {}, { isAdmin: false }));
    await staff((c) => moveOrder(c, id, 'dispatched', {}, { isAdmin: false })); // invoices itself first
    assert.deepEqual(await stockOf('CPR-26KG'), { on_hand: 8, reserved: 0, damaged: 0 });
    assert.deepEqual(await stockOf('CPR-5KG'), { on_hand: 47, reserved: 0, damaged: 0 });

    o = await staff((c) => getOrder(c, id));
    assert.equal(o.status, 'dispatched');
    const inv = await staff((c) => getInvoice(c, o.invoices[0].id));
    // 26 kg at 0% is exempt: Rs 5,000. The 5 kg bags: Rs 1,560 including 5% GST
    // -> taxable 1485.71, GST 74.29 split 37.14 + 37.15.
    assert.equal(inv.number, `CR/${fy}/0001`);
    assert.equal(inv.doc_type, 'invoice_cum_bos');
    assert.equal(inv.supply_type, 'B2CS');
    assert.equal(inv.exempt_paise, 500000);
    assert.equal(inv.taxable_paise, 148571);
    assert.equal(inv.cgst_paise, 3714);
    assert.equal(inv.sgst_paise, 3715);
    assert.equal(inv.igst_paise, 0);
    assert.equal(inv.total_paise, 656000);
    assert.equal(inv.round_off_paise, 0);
    assert.equal(inv.amount_in_words, 'Rupees Six Thousand Five Hundred Sixty Only');
    assert.equal(inv.balance.balance_paise, 656000);

    await staff((c) => moveOrder(c, id, 'delivered', {}, { isAdmin: false }));
    const events = (await staff((c) => getOrder(c, id))).events.map((e) => [e.action, e.actor]);
    assert.deepEqual(events[0], ['created', 'staff@cholanrice.in']);
    assert.ok(events.some(([a]) => a === 'invoiced'));
  });

  test('an issued invoice cannot be edited, and lines cannot be changed', async () => {
    const inv = (await app.query("SELECT id FROM sales.invoices ORDER BY id LIMIT 1")).rows[0];
    await assert.rejects(app.query('UPDATE sales.invoices SET total_paise = 1 WHERE id = $1', [inv.id]), /cannot be changed/);
    await assert.rejects(app.query('UPDATE sales.invoice_lines SET qty = 1 WHERE invoice_id = $1', [inv.id]), (e) => e.code === '42501');
    await assert.rejects(app.query('DELETE FROM sales.invoices WHERE id = $1', [inv.id]), (e) => e.code === '42501');
  });

  test('payments are matched to invoices and can never be over-spent or deleted', async () => {
    await staff((c) => createReceipt(c, { partyId: hotel.id, amount: '3,000', method: 'upi', reference: 'UTR123456' }));
    let acct = await staff((c) => partyAccount(c, hotel.id));
    assert.equal(acct.balance.invoiced_due_paise, 656000 - 300000);
    await assert.rejects(staff((c) => createReceipt(c, { partyId: hotel.id, amount: '500', method: 'upi' })), /reference/);
    const inv = acct.invoices[0];
    await assert.rejects(
      staff((c) => createReceipt(c, { partyId: hotel.id, amount: '9,000', method: 'cash', allocations: [{ invoiceId: inv.invoice_id, amount: '9000' }] })),
      /only ₹3,560 left/,
    );
    // An advance: more than is owed is kept, unallocated, for the next invoice.
    const advance = await staff((c) => createReceipt(c, { partyId: hotel.id, amount: '10,000', method: 'cash' }));
    acct = await staff((c) => partyAccount(c, hotel.id));
    assert.equal(acct.balance.invoiced_due_paise, 0);
    assert.equal(acct.balance.advance_paise, 1_000_000 - 356000);
    await assert.rejects(app.query('DELETE FROM sales.receipts WHERE id = $1', [advance]), (e) => e.code === '42501');
    await boss((c) => reverseReceipt(c, advance, { reason: 'Entered twice' }));
    acct = await staff((c) => partyAccount(c, hotel.id));
    assert.equal(acct.balance.invoiced_due_paise, 356000);
    assert.equal(acct.balance.advance_paise, 0);
  });

  test('a return puts bags back and makes a credit note', async () => {
    const o = (await app.query("SELECT id FROM sales.orders WHERE status = 'delivered' ORDER BY id LIMIT 1")).rows[0];
    const full = await staff((c) => getOrder(c, o.id));
    const fiveKg = full.lines.find((l) => l.item_id === sku['CPR-5KG']);
    await boss((c) => recordReturn(c, o.id, { lines: [{ orderLineId: fiveKg.id, qty: 1, condition: 'damaged' }], notes: 'Torn bag' }));
    assert.deepEqual(await stockOf('CPR-5KG'), { on_hand: 47, reserved: 0, damaged: 1 });
    const after = await staff((c) => getOrder(c, o.id));
    assert.equal(after.status, 'delivered'); // only part came back
    assert.equal(after.creditNotes[0].number, `CN/${fy}/0001`);
    assert.equal(after.creditNotes[0].total_paise, 52000);
    const acct = await staff((c) => partyAccount(c, hotel.id));
    assert.equal(acct.balance.invoiced_due_paise, 356000 - 52000);
    await assert.rejects(boss((c) => recordReturn(c, o.id, { lines: [{ orderLineId: fiveKg.id, qty: 3 }] })), /Only 2 bags/);
  });

  test('credit control stops an order over the limit, unless an owner overrides with a reason', async () => {
    await boss((c) => saveParty(c, hotel.id, { customer: { segment: 'hotel', creditLimit: '5000', termsDays: 15 } }));
    const id = await order(hotel.id, [['CPR-26KG', 2]]);
    await assert.rejects(staff((c) => moveOrder(c, id, 'confirmed', {}, { isAdmin: false })), /cannot be confirmed: this would take them to ₹8,040/);
    await assert.rejects(boss((c) => moveOrder(c, id, 'confirmed', { override: true }, { isAdmin: true })), /cannot be confirmed/); // no reason
    await boss((c) => moveOrder(c, id, 'confirmed', { override: true, reason: 'Owner agreed by phone' }, { isAdmin: true }));
    const o = await staff((c) => getOrder(c, id));
    assert.equal(o.credit_override_reason, 'Owner agreed by phone');
    assert.match(o.events.at(-1).detail, /credit check: Owner agreed by phone/);
    await boss((c) => moveOrder(c, id, 'cancelled', { reason: 'Test over' }, { isAdmin: true }));
    assert.deepEqual(await stockOf('CPR-26KG'), { on_hand: 8, reserved: 0, damaged: 0 }); // released
    await boss((c) => saveParty(c, hotel.id, { customer: { segment: 'hotel', creditLimit: '50000', termsDays: 15 } }));
  });

  test('an overdue invoice or a customer on hold stops new orders', async () => {
    const shop = await boss((c) => saveParty(c, null, { kind: 'business', displayName: 'Late Payer Stores', isCustomer: true, customer: { segment: 'retailer', termsDays: 7 } }));
    const first = await order(shop.id, [['KAR-26KG', 1]]);
    await staff((c) => moveOrder(c, first, 'confirmed', {}, { isAdmin: false }));
    await staff((c) => createInvoice(c, first, { invoiceDate: '2026-04-01' })); // due 8 April: long overdue
    const second = await order(shop.id, [['KAR-26KG', 1]]);
    await assert.rejects(staff((c) => moveOrder(c, second, 'confirmed', {}, { isAdmin: false })), /1 invoice is overdue/);
    await boss((c) => saveParty(c, shop.id, { customer: { segment: 'retailer', termsDays: 7, creditStatus: 'hold' } }));
    await assert.rejects(staff((c) => moveOrder(c, second, 'confirmed', {}, { isAdmin: false })), /on hold/);
  });

  test('an invoice can be cancelled before dispatch, keeping its number; not after', async () => {
    const id = await order(hotel.id, [['KAR-26KG', 1]]);
    await staff((c) => moveOrder(c, id, 'confirmed', {}, { isAdmin: false }));
    await staff((c) => createInvoice(c, id, {}));
    let o = await staff((c) => getOrder(c, id));
    const number = o.invoices[0].number;
    await assert.rejects(boss((c) => cancelInvoice(c, o.invoices[0].id, {})), /reason/);
    await boss((c) => cancelInvoice(c, o.invoices[0].id, { reason: 'Wrong address' }));
    await staff((c) => createInvoice(c, id, {}));
    o = await staff((c) => getOrder(c, id));
    assert.equal(o.invoices.length, 2);
    assert.notEqual(o.invoices[1].number, number); // a cancelled number is never reused
    for (const step of ['packing', 'packed', 'dispatched']) await staff((c) => moveOrder(c, id, step, {}, { isAdmin: false }));
    await assert.rejects(boss((c) => cancelInvoice(c, o.invoices[1].id, { reason: 'x' })), /goods have left/);
  });

  test('20 orders racing for the last 5 bags: exactly 5 are confirmed', async () => {
    const ids = [];
    for (let i = 0; i < 20; i += 1) {
      const p = await boss((c) => saveParty(c, null, { kind: 'person', displayName: `Buyer ${i}`, isCustomer: true, customer: { segment: 'b2c' } }));
      ids.push(await order(p.id, [['KTM-26KG', 1]]));
    }
    const results = await Promise.allSettled(ids.map((id) => staff((c) => moveOrder(c, id, 'confirmed', {}, { isAdmin: false }))));
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
    for (const r of results.filter((x) => x.status === 'rejected')) assert.match(r.reason.message, /Not enough/);
    assert.deepEqual(await stockOf('KTM-26KG'), { on_hand: 5, reserved: 5, damaged: 0 });
  });

  test('20 invoices made at the same moment are numbered with no gaps, and the bill book can carry on', async () => {
    const gstin = (await app.query('SELECT gstin FROM org.gst_registrations LIMIT 1')).rows[0].gstin;
    const used = (await app.query("SELECT next_no FROM core.doc_series WHERE doc_type = 'invoice'")).rows[0].next_no;
    await assert.rejects(boss((c) => setSeries(c, { docType: 'invoice', scope: gstin, fy, prefix: `CR/${fy}/`, nextNo: 1 })), /only go up/);
    await boss((c) => setSeries(c, { docType: 'invoice', scope: gstin, fy, prefix: `CR/${fy}/`, nextNo: 1250 }));
    // A distributor with no credit limit set (pays on order), so the limit plays no part here.
    const dist = await boss((c) => saveParty(c, null, { kind: 'business', displayName: 'Kongu Distributors', isCustomer: true, customer: { segment: 'distributor' } }));
    const ids = [];
    for (let i = 0; i < 20; i += 1) {
      const id = await order(dist.id, [['KAR-26KG', 1]]);
      await staff((c) => moveOrder(c, id, 'confirmed', {}, { isAdmin: false }));
      ids.push(id);
    }
    await Promise.all(ids.map((id) => staff((c) => createInvoice(c, id, {}))));
    const numbers = (await app.query('SELECT number FROM sales.invoices WHERE order_id = ANY($1) ORDER BY number', [ids])).rows.map((r) => r.number);
    assert.deepEqual(numbers, Array.from({ length: 20 }, (_, i) => `CR/${fy}/${1250 + i}`));
    assert.ok(used > 1);
  });
});
