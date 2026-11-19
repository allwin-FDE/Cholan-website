// npm run test:db — Phase 3 on the business database: branches, batches,
// transfers, goods received, supplier bills and payments, purchase returns,
// packing runs, stock changes for approval and expenses, on a fresh throwaway
// database on the local test server. Skipped without DEV_DB_ADMIN_URL.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../scripts/seed-reference.js';
import '../src/db/pool.js';
import { friendly, saveParty } from '../src/lib/business.js';
import { adjustStock, createOrder, moveOrder } from '../src/lib/sales.js';
import * as w from '../src/lib/inward.js';

const ADMIN = process.env.DEV_DB_ADMIN_URL;
const name = `cholan_inward_${process.pid}`;
const urlFor = (url, database) => Object.assign(new URL(url), { pathname: `/${database}` }).href;

describe('inward and branches', { skip: !ADMIN && 'DEV_DB_ADMIN_URL is not set' }, () => {
  let admin;
  let owner;
  let app;
  const sku = {};
  let mill;
  let hotel;
  let godown;
  let branch2;

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
  const stock = async (locationId, code) =>
    (await app.query('SELECT on_hand, reserved, damaged FROM inv.stock_balances b JOIN catalog.items i ON i.id = b.item_id WHERE b.location_id = $1 AND i.sku_code = $2', [locationId, code])).rows[0] || {
      on_hand: 0,
      reserved: 0,
      damaged: 0,
    };

  before(async () => {
    admin = new pg.Pool({ connectionString: ADMIN, max: 1 });
    await admin.query(`CREATE DATABASE ${name} OWNER cholan_owner`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${name} TO cholan_owner, cholan_app, cholan_read`);
    owner = new pg.Pool({ connectionString: urlFor(process.env.MIGRATE_DATABASE_URL, name), max: 2 });
    app = new pg.Pool({ connectionString: urlFor(process.env.DATABASE_URL, name), max: 10 });
    await migrate(owner, { log: () => {} });
    await seed(owner, { log: () => {} });
    // Raw rice by the kilo and empty bags, for packing.
    const o = await owner.connect();
    await o.query('SET ROLE cholan_owner');
    await o.query(`INSERT INTO catalog.items (kind, sku_code, name, uom, hsn, gst_rate_bp) VALUES
      ('raw', 'RAW-PONNI', 'Raw Ponni rice', 'kg', '1006', 0), ('packing', 'BAG-26KG', 'Empty 26 kg bag', 'piece', '6305', 500)`);
    o.release();
    for (const r of (await app.query('SELECT id, sku_code FROM catalog.items')).rows) sku[r.sku_code] = r.id;
    godown = (await app.query("SELECT id FROM org.locations WHERE kind = 'godown' ORDER BY id LIMIT 1")).rows[0].id;
    mill = await boss((c) =>
      saveParty(c, null, {
        kind: 'business',
        displayName: 'Sri Murugan Rice Mill',
        gstin: '33ABCDE1234F1Z5',
        isSupplier: true,
        supplier: { supplierType: 'mill', termsDays: 30 },
        address: { line1: 'Mill Road', city: 'Kangeyam', stateCode: '33', pincode: '638701' },
      }),
    );
    hotel = await boss((c) =>
      saveParty(c, null, {
        kind: 'business',
        displayName: 'Annapoorna Hotel',
        isCustomer: true,
        customer: { segment: 'hotel', creditLimit: '500000', termsDays: 15 },
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

  test('a new branch gets its godown, damaged and in-transit places', async () => {
    const { branches } = await boss(async (c) => {
      await w.saveBranch(c, null, { code: 'TPR', name: 'Tiruppur shop', kind: 'store', addressLine1: '5 Kumaran Road', city: 'Tiruppur', pincode: '641601' });
      return w.listBranches(c);
    });
    const b = branches.find((x) => x.code === 'TPR');
    branch2 = b.id;
    assert.deepEqual(b.locations.map((l) => l.kind).sort(), ['damaged', 'godown', 'in_transit']);
    await assert.rejects(boss((c) => w.saveBranch(c, null, { code: 'TPR', name: 'Again', kind: 'store', addressLine1: 'x', city: 'y', pincode: '641601' })), /already has this code/);
  });

  test('goods received: accepted bags go in as a batch, the rest are rejected with a reason, and the PO follows', async () => {
    const po = await boss((c) => w.createPurchaseOrder(c, { partyId: mill.id, lines: [{ itemId: sku['CPR-26KG'], qty: 100, rate: '1200', gstRate: '0' }] }));
    await assert.rejects(
      staff((c) => w.createGoodsReceived(c, { partyId: mill.id, locationId: godown, orderId: po.id ?? po, lines: [{ itemId: sku['CPR-26KG'], qtyReceived: 60, qtyAccepted: 58 }] })),
      /Say why/,
    );
    const grn = await staff((c) =>
      w.createGoodsReceived(c, {
        partyId: mill.id,
        locationId: godown,
        orderId: po,
        grossKg: '9000',
        tareKg: '7400',
        moisturePct: '13.5',
        lines: [{ itemId: sku['CPR-26KG'], qtyReceived: 60, qtyAccepted: 58, rejectReason: 'Torn bags', batch: { code: 'LOT-A', packedOn: '2026-11-01', bestBefore: '2027-05-01' } }],
      }),
    );
    const g = await staff((c) => w.getGoodsReceived(c, grn));
    assert.equal(g.qty_accepted, 58);
    assert.equal(g.lines[0].batch_code, 'LOT-A');
    assert.deepEqual(await stock(godown, 'CPR-26KG'), { on_hand: 58, reserved: 0, damaged: 0 });
    const p = await staff((c) => w.getPurchaseOrder(c, po));
    assert.equal(p.status, 'part_received');
    // A second, newer lot.
    await staff((c) =>
      w.createGoodsReceived(c, { partyId: mill.id, locationId: godown, orderId: po, lines: [{ itemId: sku['CPR-26KG'], qtyReceived: 42, batch: { code: 'LOT-B', packedOn: '2026-11-10', bestBefore: '2027-05-10' } }] }),
    );
    assert.equal((await staff((c) => w.getPurchaseOrder(c, po))).status, 'received');
  });

  test('dispatch takes the oldest batch first, so it is known which batch went to which customer', async () => {
    const id = await staff((c) => createOrder(c, { partyId: hotel.id, lines: [{ itemId: sku['CPR-26KG'], qty: 60 }] }, { canSetPrice: false }));
    for (const to of ['confirmed', 'packing', 'packed', 'dispatched']) await staff((c) => moveOrder(c, id, to, {}, { isAdmin: false }));
    const lotA = (await app.query("SELECT id FROM inv.batches WHERE code = 'LOT-A'")).rows[0].id;
    const trace = await staff((c) => w.batchTrace(c, lotA));
    assert.equal(trace.customers.length, 1);
    assert.equal(trace.customers[0].party_name, 'Annapoorna Hotel');
    assert.equal(trace.customers[0].qty, 58);
    const left = await staff((c) => w.listBatches(c, { itemId: sku['CPR-26KG'] }));
    assert.deepEqual(left.map((b) => [b.code, b.on_hand]), [['LOT-B', 40]]);
  });

  test('supplier bill: exact GST, rounding, due date from terms, never entered twice', async () => {
    const bill = await staff((c) =>
      w.createBill(c, {
        partyId: mill.id,
        supplierBillNo: 'SMR/101',
        billDate: '2026-11-15',
        lines: [
          { itemId: sku['CPR-26KG'], qty: '58', rate: '1200', gstRate: '0' },
          { description: 'Printed bags', qty: '100', unit: 'piece', rate: '12.33', gstRate: '5' },
        ],
      }),
    );
    const b = await staff((c) => w.getBill(c, bill));
    // 58 × 1200 = 69,600 exempt; 100 × 12.33 = 1,233.00 + 5% = 61.65 (30.82 CGST + 30.83 SGST)
    assert.equal(b.taxable_paise, 6960000 + 123300);
    assert.equal(b.cgst_paise, 3082);
    assert.equal(b.sgst_paise, 3083);
    assert.equal(b.igst_paise, 0);
    assert.equal(b.total_paise, 7089500); // 70,894.65 rounded to 70,895
    assert.equal(b.round_off_paise, 35);
    assert.equal(b.due_date, '2026-12-15');
    await assert.rejects(staff((c) => w.createBill(c, { partyId: mill.id, supplierBillNo: 'smr/101', billDate: '2026-11-15', lines: [{ description: 'x', qty: '1', rate: '1' }] })), /already entered/);
    await assert.rejects(
      staff((c) => w.createBill(c, { partyId: mill.id, supplierBillNo: 'SMR/102', billDate: '2026-11-15', totalAsBilled: '500', lines: [{ description: 'x', qty: '1', rate: '100' }] })),
      /add up to/,
    );
  });

  test('paying a supplier: oldest bill first, never more than owed; a return lowers the bill and the stock', async () => {
    const bill = (await app.query("SELECT id FROM purch.bills WHERE supplier_bill_no = 'SMR/101'")).rows[0].id;
    await staff((c) => w.createSupplierPayment(c, { partyId: mill.id, method: 'bank', reference: 'UTR123', amount: '50000' }));
    let acct = await staff((c) => w.supplierAccount(c, mill.id));
    assert.equal(acct.balance.billed_due_paise, 7089500 - 5000000);
    await staff((c) => w.createSupplierPayment(c, { partyId: mill.id, method: 'cash', amount: '30000', allocate: false }));
    await assert.rejects(staff((c) => w.allocateSupplierPayment(c, (acct.payments[0].id), { allocations: [{ billId: bill, amount: '30000' }] })), /left to pay|left to allocate/);

    const ret = await boss((c) => w.createPurchaseReturn(c, { partyId: mill.id, billId: bill, locationId: godown, reason: 'Wet bags', lines: [{ itemId: sku['CPR-26KG'], qty: 2, rate: '1200', gstRate: '0' }] }));
    assert.ok(ret);
    acct = await staff((c) => w.supplierAccount(c, mill.id));
    assert.equal(acct.balance.billed_due_paise, 7089500 - 5000000 - 240000);
    assert.equal((await stock(godown, 'CPR-26KG')).on_hand, 38);
    await assert.rejects(boss((c) => w.cancelBill(c, bill, { reason: 'test' })), /Reverse them first/);
  });

  test('a transfer to another branch: in transit, then received with a shortfall explained', async () => {
    const t = await staff((c) => w.createTransfer(c, { fromLocationId: godown, toBranchId: branch2, vehicleNo: 'TN38AB1234', lines: [{ itemId: sku['CPR-26KG'], qty: 10 }] }).then((id) => w.getTransfer(c, id)));
    const transit = (await app.query("SELECT id FROM org.locations WHERE branch_id = $1 AND kind = 'in_transit'", [branch2])).rows[0].id;
    const dest = (await app.query("SELECT id FROM org.locations WHERE branch_id = $1 AND kind = 'godown'", [branch2])).rows[0].id;
    assert.equal((await stock(godown, 'CPR-26KG')).on_hand, 28);
    assert.equal((await stock(transit, 'CPR-26KG')).on_hand, 10);
    await assert.rejects(staff((c) => w.receiveTransfer(c, t.id, { lines: [{ id: t.lines[0].id, qtyReceived: 9 }] })), /short/);
    await staff((c) => w.receiveTransfer(c, t.id, { lines: [{ id: t.lines[0].id, qtyReceived: 9 }], notes: 'One bag burst on the lorry' }));
    assert.equal((await stock(transit, 'CPR-26KG')).on_hand, 0);
    assert.equal((await stock(dest, 'CPR-26KG')).on_hand, 9);
    await assert.rejects(staff((c) => w.createTransfer(c, { fromLocationId: godown, toBranchId: branch2, lines: [{ itemId: sku['CPR-26KG'], qty: 500 }] })), /Not enough/);
  });

  test('a packing run: raw rice and empty bags in, packed bags out as a new batch', async () => {
    await boss((c) => adjustStock(c, { itemId: sku['RAW-PONNI'], kind: 'opening', qty: 1000 }));
    await boss((c) => adjustStock(c, { itemId: sku['BAG-26KG'], kind: 'opening', qty: 50 }));
    await staff((c) =>
      w.createPackingRun(c, { locationId: godown, inputs: [{ itemId: sku['RAW-PONNI'], qty: 520 }, { itemId: sku['BAG-26KG'], qty: 20 }], outputs: [{ itemId: sku['CPR-26KG'], qty: 20 }] }),
    );
    assert.equal((await stock(godown, 'RAW-PONNI')).on_hand, 480);
    assert.equal((await stock(godown, 'BAG-26KG')).on_hand, 30);
    assert.equal((await stock(godown, 'CPR-26KG')).on_hand, 48);
    await assert.rejects(
      staff((c) => w.createPackingRun(c, { locationId: godown, inputs: [{ itemId: sku['RAW-PONNI'], qty: 26 }], outputs: [{ itemId: sku['CPR-26KG'], qty: 5 }] })),
      /more than the 26 kg/,
    );
  });

  test('staff ask for a stock change; it happens only when a manager approves', async () => {
    const { id } = { id: await staff((c) => w.createStockRequest(c, { locationId: godown, itemId: sku['CPR-26KG'], kind: 'damage', qty: 3, reason: 'Rat damage' })) };
    assert.equal((await stock(godown, 'CPR-26KG')).damaged, 0);
    await assert.rejects(boss((c) => w.decideStockRequest(c, id, { decision: 'rejected' })), /Say why/);
    await boss((c) => w.decideStockRequest(c, id, { decision: 'approved' }));
    assert.deepEqual(await stock(godown, 'CPR-26KG'), { on_hand: 45, reserved: 0, damaged: 3 });
    await assert.rejects(boss((c) => w.decideStockRequest(c, id, { decision: 'approved' })), /already approved/);
  });

  test('expenses: GST split, saved once, only cancelled with a reason', async () => {
    const cat = (await app.query("SELECT id FROM acct.expense_categories WHERE name LIKE 'Transport%'")).rows[0].id;
    const id = await staff((c) =>
      w.createExpense(c, { categoryId: cat, payeeName: 'KPN Transport', description: 'Lorry hire, Kangeyam to Coimbatore', amount: '4500', gstRate: '5', supplierGstin: '33ABCDE1234F1Z5', paidBy: 'upi', reference: 'UPI99' }),
    );
    const [e] = await staff((c) => w.listExpenses(c));
    assert.equal(e.id, id);
    assert.equal(e.cgst_paise + e.sgst_paise, 22500);
    assert.equal(e.total_paise, 472500);
    assert.equal(e.itc_eligible, true);
    await assert.rejects(app.query('UPDATE acct.expenses SET total_paise = 1 WHERE id = $1', [id]), /cannot be changed/);
    await boss((c) => w.cancelExpense(c, id, { reason: 'Entered twice' }));
    await assert.rejects(boss((c) => w.cancelExpense(c, id, { reason: 'again' })), /already cancelled/);
  });
});
