// Phase 3 on the business database: branches and storage places, batches,
// transfers between branches, purchase orders, goods received, supplier bills
// and payments, purchase returns (debit notes), packing runs, stock changes
// approved by a manager, and expenses.
//
// Like lib/sales.js, each function takes a client inside a transaction
// (db/pool.js withTx) as the signed-in person, money is whole paise, and every
// bag in or out is a row in inv.stock_moves.
import { InputError, cleanGstin, toPaise } from './business.js';

const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const orNull = (value) => (value === '' || value === undefined ? null : value);
const notFound = (what) => Object.assign(new Error(`${what} not found.`), { status: 404 });
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const one = async (client, sql, values) => (await client.query(sql, values)).rows[0];
const all = async (client, sql, values) => (await client.query(sql, values)).rows;
const today = async (client) => (await one(client, 'SELECT core.today_ist()::text AS d')).d;
const fyOf = async (client, date) => (await one(client, 'SELECT core.fy($1::date) AS fy', [date])).fy;

function cleanDate(value, field, fallback = null) {
  if (value == null || value === '') return fallback;
  const v = text(String(value), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new InputError('Choose a date.', { [field]: 'Choose a date.' });
  return v;
}
function whole(value, field, { min = 1, max = 10_000_000, label = 'a whole number' } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new InputError(`Enter ${label}.`, { [field]: `A whole number from ${min}.` });
  return n;
}
function decimal(value, field, { min = 0, max = 1e9, places = 3 } = {}) {
  if (value == null || value === '') return null;
  const v = String(value).replace(/[,\s]/g, '');
  const n = Number(v);
  if (!/^\d+(\.\d+)?$/.test(v) || n < min || n > max) throw new InputError('Enter a number.', { [field]: 'Enter a number.' });
  return Number(n.toFixed(places));
}
// "5" or "5%" → 500 basis points.
function rateBp(value, field = 'gstRate') {
  const v = String(value ?? '').replace('%', '').trim();
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 40) throw new InputError('Enter the GST rate in percent (0, 5, 12, 18…).', { [field]: 'A rate in percent.' });
  return Math.round(n * 100);
}
// GST on an amount before tax, split evenly into CGST and SGST inside the
// state (the odd paisa goes to SGST, as on invoices), or all IGST outside.
function taxOn(taxable, bp, interstate) {
  const tax = Math.round((taxable * bp) / 10000);
  if (interstate) return { cgst: 0, sgst: 0, igst: tax, tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0, tax };
}

async function number(client, type, prefix, date) {
  const fy = await fyOf(client, date);
  return (await one(client, 'SELECT core.next_number($1, $2, $3, $4, 4::smallint) AS n', [type, 'all', fy, `${prefix}/${fy}/`])).n;
}

// One row in the stock ledger (the balance follows by trigger and can't go
// below zero).
async function move(client, m) {
  await client.query(
    `INSERT INTO inv.stock_moves (location_id, item_id, batch_id, type, on_hand_change, reserved_change, damaged_change, ref_type, ref_id, ref_number, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [m.locationId, m.itemId, m.batchId || null, m.type, m.onHand || 0, m.reserved || 0, m.damaged || 0, m.refType || null, m.refId || null, m.refNumber || null, m.reason || null],
  );
}

async function itemOf(client, id, field = 'itemId') {
  const item = await one(client, 'SELECT id, name, sku_code, kind, uom, hsn, gst_rate_bp, net_weight_g, pack_label FROM catalog.items WHERE id = $1 AND active', [Number(id)]);
  if (!item) throw new InputError('Choose an item.', { [field]: 'Choose an item.' });
  return item;
}

// Bags in a place that are not promised to an order (and, for one batch, of
// that batch).
async function free(client, locationId, itemId, batchId = null) {
  const b = await one(client, 'SELECT on_hand - reserved AS free FROM inv.stock_balances WHERE location_id = $1 AND item_id = $2', [locationId, itemId]);
  let n = b?.free ?? 0;
  if (batchId) {
    const bs = await one(client, 'SELECT on_hand FROM inv.batch_stock WHERE location_id = $1 AND item_id = $2 AND batch_id = $3', [locationId, itemId, batchId]);
    n = Math.min(n, bs?.on_hand ?? 0);
  }
  return n;
}
async function needFree(client, locationId, item, qty, batchId = null) {
  const n = await free(client, locationId, item.id, batchId);
  if (n < qty) throw new InputError(`Not enough ${item.name}${batchId ? ' in that batch' : ''}: ${n} free here, ${qty} needed.`);
}

// ---- Branches and places ----
export async function listBranches(client) {
  const [branches, locations, registrations] = await Promise.all([
    all(client, 'SELECT * FROM org.branches ORDER BY id'),
    all(client, 'SELECT * FROM org.locations ORDER BY branch_id, id'),
    all(client, 'SELECT id, gstin, state_code, legal_name FROM org.gst_registrations WHERE active ORDER BY id'),
  ]);
  return { branches: branches.map((b) => ({ ...b, locations: locations.filter((l) => l.branch_id === b.id) })), registrations };
}

const BRANCH_KINDS = ['store', 'warehouse', 'mill', 'office'];
const LOCATION_KINDS = ['godown', 'shelf', 'damaged', 'in_transit'];

export async function saveBranch(client, id, body) {
  const code = text(body.code, 6).toUpperCase();
  const name = text(body.name, 80);
  const fields = {};
  if (!/^[A-Z0-9]{2,6}$/.test(code)) fields.code = '2 to 6 capital letters or numbers, like CBE.';
  if (name.length < 2) fields.name = 'Enter a name.';
  if (!BRANCH_KINDS.includes(body.kind)) fields.kind = 'Choose one.';
  const line1 = text(body.addressLine1, 120);
  const city = text(body.city, 60);
  const pincode = text(String(body.pincode ?? ''), 6);
  if (!line1) fields.addressLine1 = 'Enter the address.';
  if (!city) fields.city = 'Enter the town.';
  if (!/^[1-9][0-9]{5}$/.test(pincode)) fields.pincode = 'A 6-digit PIN code.';
  const fssai = text(String(body.fssaiLicence ?? ''), 14);
  if (fssai && !/^[0-9]{14}$/.test(fssai)) fields.fssaiLicence = 'An FSSAI licence has 14 digits.';
  if (Object.keys(fields).length) throw new InputError('Please check the highlighted details.', fields);
  const reg = body.gstRegistrationId
    ? await one(client, 'SELECT id, state_code FROM org.gst_registrations WHERE id = $1', [Number(body.gstRegistrationId)])
    : await one(client, 'SELECT id, state_code FROM org.gst_registrations WHERE active ORDER BY id LIMIT 1');
  if (!reg) throw new InputError('Add the company’s GST registration first.');
  const stateCode = text(String(body.stateCode || reg.state_code), 2);
  const values = [code, name, body.kind, reg.id, line1, orNull(text(body.addressLine2, 120)), city, pincode, stateCode, orNull(text(body.phone, 20)), orNull(fssai), body.holdsStock !== false, body.active !== false];
  if (id) {
    const row = await one(
      client,
      `UPDATE org.branches SET code = $1, name = $2, kind = $3, gst_registration_id = $4, address_line1 = $5, address_line2 = $6, city = $7, pincode = $8,
              state_code = $9, phone = $10, fssai_licence = $11, holds_stock = $12, active = $13 WHERE id = $14 RETURNING id`,
      [...values, id],
    );
    if (!row) throw notFound('Branch');
    return row.id;
  }
  const row = await one(
    client,
    `INSERT INTO org.branches (code, name, kind, gst_registration_id, address_line1, address_line2, city, pincode, state_code, phone, fssai_licence, holds_stock, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    values,
  );
  // A new branch that holds stock gets its godown, damaged and in-transit places.
  if (row && body.holdsStock !== false) {
    for (const [c, n, k] of [['MAIN', 'Main godown', 'godown'], ['DMG', 'Damaged goods', 'damaged'], ['TRANSIT', 'Goods in transit', 'in_transit']]) {
      await client.query('INSERT INTO org.locations (branch_id, code, name, kind) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [row.id, c, n, k]);
    }
  }
  return row.id;
}

export async function saveLocation(client, branchId, id, body) {
  const code = text(body.code, 12).toUpperCase();
  const name = text(body.name, 80);
  if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new InputError('Give a short code, like G2.', { code: 'Letters, numbers and -.' });
  if (name.length < 2) throw new InputError('Enter a name.', { name: 'Enter a name.' });
  if (!LOCATION_KINDS.includes(body.kind)) throw new InputError('Choose what kind of place this is.', { kind: 'Choose one.' });
  if (id) {
    const row = await one(client, 'UPDATE org.locations SET code = $1, name = $2, kind = $3, active = $4 WHERE id = $5 AND branch_id = $6 RETURNING id', [code, name, body.kind, body.active !== false, id, branchId]);
    if (!row) throw notFound('Place');
    return row.id;
  }
  const row = await one(client, 'INSERT INTO org.locations (branch_id, code, name, kind) VALUES ($1, $2, $3, $4) RETURNING id', [branchId, code, name, body.kind]);
  return row.id;
}

// A place, with its branch.
async function placeOf(client, locationId, field = 'locationId') {
  const p = await one(
    client,
    `SELECT l.id, l.code, l.name, l.kind, l.branch_id, b.code AS branch_code, b.name AS branch_name, b.state_code
     FROM org.locations l JOIN org.branches b ON b.id = l.branch_id WHERE l.id = $1 AND l.active AND b.active`,
    [Number(locationId)],
  );
  if (!p) throw new InputError('Choose the place.', { [field]: 'Choose a place.' });
  return p;
}
async function godownOf(client, branchId) {
  const p = await one(client, "SELECT id FROM org.locations WHERE branch_id = $1 AND kind = 'godown' AND active ORDER BY id LIMIT 1", [branchId]);
  if (!p) throw new InputError('That branch has no godown yet. Add one under Branches.');
  return p.id;
}
// The branch's "goods in transit" place, made the first time it is needed.
async function transitOf(client, branchId) {
  const p = await one(client, "SELECT id FROM org.locations WHERE branch_id = $1 AND kind = 'in_transit' AND active ORDER BY id LIMIT 1", [branchId]);
  if (p) return p.id;
  const code = (await one(client, "SELECT 1 FROM org.locations WHERE branch_id = $1 AND code = 'TRANSIT'", [branchId])) ? `TRANSIT-${Date.now() % 1000}` : 'TRANSIT';
  return (await one(client, "INSERT INTO org.locations (branch_id, code, name, kind) VALUES ($1, $2, 'Goods in transit', 'in_transit') RETURNING id", [branchId, code])).id;
}

// Stock in every place (or one), with each pack's free bags.
export async function stockByPlace(client, { locationId = null } = {}) {
  return all(
    client,
    `SELECT b.location_id, l.code AS location_code, l.name AS location_name, l.kind AS location_kind, br.id AS branch_id, br.name AS branch_name,
            i.id AS item_id, i.sku_code, i.name, i.pack_label, i.kind, i.uom, b.on_hand, b.reserved, b.damaged, b.on_hand - b.reserved AS available
     FROM inv.stock_balances b JOIN org.locations l ON l.id = b.location_id JOIN org.branches br ON br.id = l.branch_id
     JOIN catalog.items i ON i.id = b.item_id
     WHERE ($1::int IS NULL OR b.location_id = $1) AND (b.on_hand <> 0 OR b.reserved <> 0 OR b.damaged <> 0)
     ORDER BY br.id, l.id, i.name`,
    [locationId],
  );
}

// ---- Batches ----
export async function listBatches(client, { itemId = null, locationId = null } = {}) {
  return all(
    client,
    `SELECT bs.*, l.name AS location_name, i.name AS item_name, i.pack_label
     FROM inv.batch_stock bs JOIN org.locations l ON l.id = bs.location_id JOIN catalog.items i ON i.id = bs.item_id
     WHERE bs.on_hand > 0 AND ($1::int IS NULL OR bs.item_id = $1) AND ($2::int IS NULL OR bs.location_id = $2)
     ORDER BY bs.best_before NULLS LAST, bs.packed_on NULLS LAST, bs.batch_id`,
    [itemId, locationId],
  );
}

export async function batchTrace(client, batchId) {
  const batch = await one(
    client,
    `SELECT b.*, i.name AS item_name, i.pack_label, p.display_name AS supplier_name
     FROM inv.batches b JOIN catalog.items i ON i.id = b.item_id LEFT JOIN party.parties p ON p.id = b.supplier_id WHERE b.id = $1`,
    [batchId],
  );
  if (!batch) throw notFound('Batch');
  const [stock, customers, moves] = await Promise.all([
    all(client, 'SELECT bs.location_id, l.name AS location_name, bs.on_hand FROM inv.batch_stock bs JOIN org.locations l ON l.id = bs.location_id WHERE bs.batch_id = $1', [batchId]),
    all(client, 'SELECT * FROM inv.batch_dispatches WHERE batch_id = $1 ORDER BY at', [batchId]),
    all(client, 'SELECT id, at, actor, type, location_id, on_hand_change, ref_type, ref_number, reason FROM inv.stock_moves WHERE batch_id = $1 ORDER BY id', [batchId]),
  ]);
  return { batch, stock, customers, moves };
}

// A new batch for bags coming in. The code is made up from the pack and the
// date when none is given (CPR-26KG-261118, then -2, -3 the same day).
async function newBatch(client, item, raw, { source, supplierId = null, packedOn = null }) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const packed = cleanDate(b.packedOn, 'packedOn', packedOn);
  const best = cleanDate(b.bestBefore, 'bestBefore', null);
  let code = text(b.code, 30);
  if (code && !/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,29}$/.test(code)) throw new InputError('A batch code may use letters, numbers, / . _ and -.', { batchCode: 'Letters, numbers, / . _ -.' });
  if (!code) {
    const stamp = (packed || (await today(client))).replaceAll('-', '').slice(2);
    const base = `${item.sku_code}-${stamp}`.slice(0, 26);
    const taken = (await one(client, "SELECT count(*)::int AS n FROM inv.batches WHERE item_id = $1 AND (code = $2 OR code LIKE $2 || '-%')", [item.id, base])).n;
    code = taken ? `${base}-${taken + 1}` : base;
  }
  const row = await one(
    client,
    `INSERT INTO inv.batches (item_id, code, source, mill_lot, packed_on, best_before, supplier_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (item_id, code) DO NOTHING RETURNING id`,
    [item.id, code, source, orNull(text(b.millLot, 40)), packed, best, supplierId, orNull(text(b.notes, 200))],
  );
  if (!row) throw new InputError(`Batch ${code} already exists for ${item.name}. Give a different code, or leave it empty.`, { batchCode: 'Already used.' });
  return row.id;
}

// The oldest batches first (best-before, then packed date) for bags leaving a
// place: [{ batchId, qty }], plus any bags with no batch.
export async function pickBatches(client, locationId, itemId, qty) {
  const batches = await all(
    client,
    'SELECT batch_id, on_hand FROM inv.batch_stock WHERE location_id = $1 AND item_id = $2 AND on_hand > 0 ORDER BY best_before NULLS LAST, packed_on NULLS LAST, batch_id',
    [locationId, itemId],
  );
  const plan = [];
  let left = qty;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(left, b.on_hand);
    plan.push({ batchId: b.batch_id, qty: take });
    left -= take;
  }
  if (left > 0) plan.push({ batchId: null, qty: left });
  return plan;
}

// ---- Transfers between branches ----
export async function createTransfer(client, body) {
  const from = await placeOf(client, body.fromLocationId, 'fromLocationId');
  const toBranch = await one(client, 'SELECT id, name FROM org.branches WHERE id = $1 AND active AND holds_stock', [Number(body.toBranchId)]);
  if (!toBranch) throw new InputError('Choose the branch the bags go to.', { toBranchId: 'Choose a branch.' });
  if (toBranch.id === from.branch_id) throw new InputError('Use a stock change to move bags inside one branch; a transfer goes to another branch.', { toBranchId: 'Another branch.' });
  const to = await godownOf(client, toBranch.id);
  const transit = await transitOf(client, toBranch.id);
  const lines = Array.isArray(body.lines) ? body.lines.filter((l) => l && l.itemId) : [];
  if (!lines.length) throw new InputError('Add at least one pack to send.');
  const date = cleanDate(body.sentOn, 'sentOn', await today(client));
  const no = await number(client, 'transfer', 'TR', date);
  const t = await one(
    client,
    `INSERT INTO inv.transfers (number, from_location_id, to_location_id, transit_location_id, sent_on, vehicle_no, driver, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [no, from.id, to, transit, date, orNull(text(body.vehicleNo, 20)), orNull(text(body.driver, 60)), orNull(text(body.notes, 500))],
  );
  for (const raw of lines) {
    const item = await itemOf(client, raw.itemId);
    const qty = whole(raw.qty, 'qty', { label: 'the number of bags' });
    const batchId = raw.batchId ? Number(raw.batchId) : null;
    await needFree(client, from.id, item, qty, batchId);
    const plan = batchId ? [{ batchId, qty }] : await pickBatches(client, from.id, item.id, qty);
    for (const p of plan) {
      await client.query('INSERT INTO inv.transfer_lines (transfer_id, item_id, batch_id, qty_sent) VALUES ($1, $2, $3, $4)', [t.id, item.id, p.batchId, p.qty]);
      const ref = { refType: 'transfer', refId: t.id, refNumber: no, itemId: item.id, batchId: p.batchId };
      await move(client, { ...ref, locationId: from.id, type: 'transfer_out', onHand: -p.qty, reason: `To ${toBranch.name}` });
      await move(client, { ...ref, locationId: transit, type: 'transfer_in', onHand: p.qty, reason: `From ${from.branch_name}` });
    }
  }
  return t.id;
}

export async function receiveTransfer(client, id, body) {
  const t = await one(client, 'SELECT * FROM inv.transfers WHERE id = $1 FOR UPDATE', [id]);
  if (!t) throw notFound('Transfer');
  if (t.status !== 'sent') throw new InputError(`This transfer is already ${t.status}.`);
  const date = cleanDate(body.receivedOn, 'receivedOn', await today(client));
  const lines = await all(client, 'SELECT * FROM inv.transfer_lines WHERE transfer_id = $1 ORDER BY id', [id]);
  const given = new Map((Array.isArray(body.lines) ? body.lines : []).map((l) => [Number(l.id), l.qtyReceived]));
  const notes = text(body.notes, 500);
  let short = 0;
  for (const l of lines) {
    const got = given.has(l.id) && given.get(l.id) !== '' ? whole(given.get(l.id), 'qtyReceived', { min: 0, label: 'the bags received' }) : l.qty_sent;
    if (got > l.qty_sent) throw new InputError('More bags cannot arrive than were sent.', { qtyReceived: `At most ${l.qty_sent}.` });
    const ref = { refType: 'transfer', refId: id, refNumber: t.number, itemId: l.item_id, batchId: l.batch_id };
    if (got) {
      await move(client, { ...ref, locationId: t.transit_location_id, type: 'transfer_out', onHand: -got, reason: 'Arrived' });
      await move(client, { ...ref, locationId: t.to_location_id, type: 'transfer_in', onHand: got, reason: 'Arrived' });
    }
    if (got < l.qty_sent) {
      short += l.qty_sent - got;
      await move(client, { ...ref, locationId: t.transit_location_id, type: 'transfer_loss', onHand: -(l.qty_sent - got), reason: notes || 'Short on arrival' });
    }
    await client.query('UPDATE inv.transfer_lines SET qty_received = $2 WHERE id = $1', [l.id, got]);
  }
  if (short && !notes) throw new InputError(`${short} ${short === 1 ? 'bag is' : 'bags are'} short. Say what happened, so the loss can be understood later.`, { notes: 'Say what happened.' });
  await client.query("UPDATE inv.transfers SET status = 'received', received_on = $2, receive_notes = $3 WHERE id = $1", [id, date, orNull(notes)]);
}

export async function cancelTransfer(client, id, body) {
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Give a reason for cancelling.', { reason: 'Give a reason.' });
  const t = await one(client, 'SELECT * FROM inv.transfers WHERE id = $1 FOR UPDATE', [id]);
  if (!t) throw notFound('Transfer');
  if (t.status !== 'sent') throw new InputError(`A transfer that is ${t.status} cannot be cancelled.`);
  for (const l of await all(client, 'SELECT * FROM inv.transfer_lines WHERE transfer_id = $1', [id])) {
    const ref = { refType: 'transfer', refId: id, refNumber: t.number, itemId: l.item_id, batchId: l.batch_id, reason: `Cancelled: ${reason}` };
    await move(client, { ...ref, locationId: t.transit_location_id, type: 'transfer_out', onHand: -l.qty_sent });
    await move(client, { ...ref, locationId: t.from_location_id, type: 'transfer_in', onHand: l.qty_sent });
  }
  await client.query("UPDATE inv.transfers SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [id, reason]);
}

export async function listTransfers(client) {
  return all(
    client,
    `SELECT t.id, t.number, t.status, t.sent_on, t.received_on, t.vehicle_no, fb.name AS from_branch, tb.name AS to_branch,
            (SELECT sum(qty_sent) FROM inv.transfer_lines WHERE transfer_id = t.id)::int AS bags_sent,
            (SELECT sum(qty_received) FROM inv.transfer_lines WHERE transfer_id = t.id)::int AS bags_received
     FROM inv.transfers t
     JOIN org.locations fl ON fl.id = t.from_location_id JOIN org.branches fb ON fb.id = fl.branch_id
     JOIN org.locations tl ON tl.id = t.to_location_id JOIN org.branches tb ON tb.id = tl.branch_id
     ORDER BY t.id DESC LIMIT 300`,
  );
}

export async function getTransfer(client, id) {
  const t = (await listTransfers(client)).find((x) => x.id === id) || null;
  if (!t) throw notFound('Transfer');
  const detail = await one(client, 'SELECT driver, notes, receive_notes, cancel_reason, created_by, created_at FROM inv.transfers WHERE id = $1', [id]);
  const lines = await all(
    client,
    `SELECT tl.*, i.name AS item_name, i.pack_label, b.code AS batch_code FROM inv.transfer_lines tl
     JOIN catalog.items i ON i.id = tl.item_id LEFT JOIN inv.batches b ON b.id = tl.batch_id WHERE tl.transfer_id = $1 ORDER BY tl.id`,
    [id],
  );
  return { ...t, ...detail, lines };
}

// ---- Suppliers ----
async function supplierOf(client, partyId) {
  const p = await one(
    client,
    `SELECT p.id, p.display_name, p.gstin, sp.terms_days,
            (SELECT a.state_code FROM party.addresses a WHERE a.party_id = p.id AND a.active ORDER BY a.is_default DESC, a.id LIMIT 1) AS state_code
     FROM party.parties p LEFT JOIN party.supplier_profiles sp ON sp.party_id = p.id WHERE p.id = $1 AND p.is_supplier AND p.active`,
    [Number(partyId)],
  );
  if (!p) throw new InputError('Choose the supplier.', { partyId: 'Choose a supplier.' });
  return p;
}
async function branchOf(client, branchId) {
  const b = branchId
    ? await one(client, 'SELECT id, name, state_code FROM org.branches WHERE id = $1 AND active', [Number(branchId)])
    : await one(client, 'SELECT id, name, state_code FROM org.branches WHERE active AND holds_stock ORDER BY id LIMIT 1');
  if (!b) throw new InputError('Choose the branch.', { branchId: 'Choose a branch.' });
  return b;
}

// ---- Purchase orders ----
const PO_OPEN = ['open', 'part_received'];

export async function createPurchaseOrder(client, body) {
  const supplier = await supplierOf(client, body.partyId);
  const branch = await branchOf(client, body.branchId);
  const lines = Array.isArray(body.lines) ? body.lines.filter((l) => l && l.itemId) : [];
  if (!lines.length) throw new InputError('Add at least one item to buy.');
  const date = cleanDate(body.orderDate, 'orderDate', await today(client));
  const no = await number(client, 'purchase_order', 'PO', date);
  const po = await one(
    client,
    'INSERT INTO purch.orders (number, branch_id, party_id, order_date, expected_on, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [no, branch.id, supplier.id, date, cleanDate(body.expectedOn, 'expectedOn', null), orNull(text(body.notes, 1000))],
  );
  let n = 0;
  for (const raw of lines) {
    const item = await itemOf(client, raw.itemId);
    n += 1;
    await client.query(
      'INSERT INTO purch.order_lines (order_id, line_no, item_id, qty, rate_paise, gst_rate_bp) VALUES ($1, $2, $3, $4, $5, $6)',
      [po.id, n, item.id, whole(raw.qty, 'qty', { label: 'the quantity' }), toPaise(raw.rate, 'rate', { allowZero: true }), rateBp(raw.gstRate) ?? item.gst_rate_bp],
    );
  }
  return po.id;
}

export async function setPurchaseOrderStatus(client, id, body) {
  const po = await one(client, 'SELECT * FROM purch.orders WHERE id = $1 FOR UPDATE', [id]);
  if (!po) throw notFound('Purchase order');
  const to = body.to;
  const reason = text(body.reason, 300);
  if (to === 'cancelled') {
    if (!PO_OPEN.includes(po.status)) throw new InputError(`A purchase order that is ${po.status} cannot be cancelled.`);
    if (po.status === 'part_received') throw new InputError('Goods have already arrived on this order. Close it instead.');
    if (!reason) throw new InputError('Give a reason for cancelling.', { reason: 'Give a reason.' });
    await client.query("UPDATE purch.orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [id, reason]);
  } else if (to === 'closed') {
    if (!PO_OPEN.includes(po.status)) throw new InputError(`A purchase order that is ${po.status} cannot be closed.`);
    await client.query("UPDATE purch.orders SET status = 'closed', notes = coalesce(notes || ' · ', '') || $2 WHERE id = $1", [id, reason || 'Closed']);
  } else throw new InputError('Choose cancel or close.');
}

export async function listPurchaseOrders(client, { status = '' } = {}) {
  return all(
    client,
    `SELECT o.id, o.number, o.status, o.order_date, o.expected_on, p.display_name AS supplier, b.name AS branch,
            (SELECT sum(qty * rate_paise) FROM purch.order_lines WHERE order_id = o.id)::bigint AS value_paise,
            (SELECT sum(qty) FROM purch.order_lines WHERE order_id = o.id)::int AS qty,
            (SELECT sum(qty_received) FROM purch.order_lines WHERE order_id = o.id)::int AS qty_received
     FROM purch.orders o JOIN party.parties p ON p.id = o.party_id JOIN org.branches b ON b.id = o.branch_id
     WHERE ($1 = '' OR ($1 = 'open' AND o.status IN ('open', 'part_received')) OR o.status = $1)
     ORDER BY o.id DESC LIMIT 300`,
    [String(status)],
  );
}

export async function getPurchaseOrder(client, id) {
  const po = await one(
    client,
    `SELECT o.*, p.display_name AS supplier, b.name AS branch FROM purch.orders o JOIN party.parties p ON p.id = o.party_id
     JOIN org.branches b ON b.id = o.branch_id WHERE o.id = $1`,
    [id],
  );
  if (!po) throw notFound('Purchase order');
  const lines = await all(client, 'SELECT l.*, i.name AS item_name, i.pack_label, i.uom FROM purch.order_lines l JOIN catalog.items i ON i.id = l.item_id WHERE l.order_id = $1 ORDER BY l.line_no', [id]);
  const receipts = await all(client, 'SELECT id, number, received_on FROM purch.receipts WHERE order_id = $1 ORDER BY id', [id]);
  return { ...po, lines, receipts };
}

// ---- Goods received ----
export async function createGoodsReceived(client, body) {
  const supplier = await supplierOf(client, body.partyId);
  const place = await placeOf(client, body.locationId);
  const po = body.orderId ? await one(client, 'SELECT * FROM purch.orders WHERE id = $1 FOR UPDATE', [Number(body.orderId)]) : null;
  if (body.orderId && (!po || po.party_id !== supplier.id)) throw new InputError('That purchase order is not this supplier’s.', { orderId: 'Not this supplier’s.' });
  if (po && !PO_OPEN.includes(po.status)) throw new InputError(`Purchase order ${po.number} is ${po.status}.`);
  const lines = Array.isArray(body.lines) ? body.lines.filter((l) => l && l.itemId) : [];
  if (!lines.length) throw new InputError('Add what arrived.');
  const gross = decimal(body.grossKg, 'grossKg', { places: 2 });
  const tare = decimal(body.tareKg, 'tareKg', { places: 2 });
  if (gross != null && tare != null && tare >= gross) throw new InputError('The empty-vehicle weight must be less than the loaded weight.', { tareKg: 'Less than the loaded weight.' });
  const moisture = decimal(body.moisturePct, 'moisturePct', { max: 100, places: 2 });
  const date = cleanDate(body.receivedOn, 'receivedOn', await today(client));
  const no = await number(client, 'goods_received', 'GRN', date);
  const grn = await one(
    client,
    `INSERT INTO purch.receipts (number, location_id, party_id, order_id, received_on, vehicle_no, weighbridge_ticket, gross_kg, tare_kg, moisture_pct, supplier_doc_no, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [no, place.id, supplier.id, po?.id || null, date, orNull(text(body.vehicleNo, 20)), orNull(text(body.weighbridgeTicket, 40)), gross, tare, moisture, orNull(text(body.supplierDocNo, 40)), orNull(text(body.notes, 1000))],
  );
  let n = 0;
  for (const raw of lines) {
    const item = await itemOf(client, raw.itemId);
    const received = whole(raw.qtyReceived, 'qtyReceived', { label: 'the quantity received' });
    const accepted = raw.qtyAccepted === '' || raw.qtyAccepted == null ? received : whole(raw.qtyAccepted, 'qtyAccepted', { min: 0, label: 'the quantity accepted' });
    if (accepted > received) throw new InputError('More cannot be accepted than arrived.', { qtyAccepted: `At most ${received}.` });
    const rejectReason = text(raw.rejectReason, 200);
    if (accepted < received && !rejectReason) throw new InputError(`Say why ${received - accepted} of ${item.name} were rejected.`, { rejectReason: 'Say why.' });
    let orderLineId = null;
    if (po) {
      const ol = raw.orderLineId
        ? await one(client, 'SELECT * FROM purch.order_lines WHERE id = $1 AND order_id = $2 FOR UPDATE', [Number(raw.orderLineId), po.id])
        : await one(client, 'SELECT * FROM purch.order_lines WHERE order_id = $1 AND item_id = $2 ORDER BY line_no LIMIT 1 FOR UPDATE', [po.id, item.id]);
      if (ol) {
        orderLineId = ol.id;
        await client.query('UPDATE purch.order_lines SET qty_received = qty_received + $2 WHERE id = $1', [ol.id, accepted]);
      }
    }
    const batchId = accepted ? await newBatch(client, item, raw.batch, { source: 'inward', supplierId: supplier.id, packedOn: null }) : null;
    n += 1;
    await client.query(
      `INSERT INTO purch.receipt_lines (receipt_id, line_no, item_id, order_line_id, qty_received, qty_accepted, reject_reason, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [grn.id, n, item.id, orderLineId, received, accepted, orNull(rejectReason), batchId],
    );
    if (accepted) {
      await move(client, { locationId: place.id, itemId: item.id, batchId, type: 'receive', onHand: accepted, refType: 'goods_received', refId: grn.id, refNumber: no, reason: `From ${supplier.display_name}` });
    }
  }
  if (po) {
    const left = await one(client, 'SELECT count(*) FILTER (WHERE qty_received < qty)::int AS open FROM purch.order_lines WHERE order_id = $1', [po.id]);
    await client.query('UPDATE purch.orders SET status = $2 WHERE id = $1', [po.id, left.open ? 'part_received' : 'received']);
  }
  return grn.id;
}

export async function listGoodsReceived(client) {
  return all(
    client,
    `SELECT r.id, r.number, r.received_on, r.vehicle_no, r.weighbridge_ticket, r.moisture_pct, r.gross_kg, r.tare_kg,
            p.display_name AS supplier, l.name AS location, o.number AS order_number,
            (SELECT sum(qty_received) FROM purch.receipt_lines WHERE receipt_id = r.id)::int AS qty_received,
            (SELECT sum(qty_accepted) FROM purch.receipt_lines WHERE receipt_id = r.id)::int AS qty_accepted,
            (SELECT b.number FROM purch.bills b WHERE b.goods_received_id = r.id AND b.status = 'open' LIMIT 1) AS bill_number
     FROM purch.receipts r JOIN party.parties p ON p.id = r.party_id JOIN org.locations l ON l.id = r.location_id
     LEFT JOIN purch.orders o ON o.id = r.order_id ORDER BY r.id DESC LIMIT 300`,
  );
}

export async function getGoodsReceived(client, id) {
  const r = (await listGoodsReceived(client)).find((x) => x.id === id);
  if (!r) throw notFound('Goods received note');
  const detail = await one(client, 'SELECT party_id, location_id, order_id, supplier_doc_no, notes, created_by, created_at FROM purch.receipts WHERE id = $1', [id]);
  const lines = await all(
    client,
    `SELECT rl.*, i.name AS item_name, i.pack_label, i.uom, i.hsn, i.gst_rate_bp, b.code AS batch_code, ol.rate_paise AS order_rate_paise
     FROM purch.receipt_lines rl JOIN catalog.items i ON i.id = rl.item_id LEFT JOIN inv.batches b ON b.id = rl.batch_id
     LEFT JOIN purch.order_lines ol ON ol.id = rl.order_line_id WHERE rl.receipt_id = $1 ORDER BY rl.line_no`,
    [id],
  );
  return { ...r, ...detail, lines };
}

// ---- Supplier bills ----
export async function createBill(client, body) {
  const supplier = await supplierOf(client, body.partyId);
  const branch = await branchOf(client, body.branchId);
  const billNo = text(body.supplierBillNo, 40);
  if (!billNo) throw new InputError('Enter the supplier’s bill number.', { supplierBillNo: 'Enter the bill number.' });
  const billDate = cleanDate(body.billDate, 'billDate');
  if (!billDate) throw new InputError('Enter the bill date.', { billDate: 'Choose a date.' });
  const gstin = cleanGstin(body.supplierGstin ?? supplier.gstin ?? '', 'supplierGstin');
  const supplierState = gstin ? gstin.slice(0, 2) : supplier.state_code || branch.state_code;
  const interstate = supplierState !== branch.state_code;
  const grn = body.goodsReceivedId ? await one(client, 'SELECT id, party_id FROM purch.receipts WHERE id = $1', [Number(body.goodsReceivedId)]) : null;
  if (body.goodsReceivedId && (!grn || grn.party_id !== supplier.id)) throw new InputError('That goods received note is not this supplier’s.', { goodsReceivedId: 'Not this supplier’s.' });
  const rawLines = Array.isArray(body.lines) ? body.lines.filter((l) => l && (l.itemId || l.description)) : [];
  if (!rawLines.length) throw new InputError('Add the lines on the bill.');
  const lines = [];
  for (const raw of rawLines) {
    const item = raw.itemId ? await itemOf(client, raw.itemId) : null;
    const qty = decimal(raw.qty, 'qty', { min: 0.001 });
    if (!qty) throw new InputError('Enter the quantity on each line.', { qty: 'Enter the quantity.' });
    const rate = toPaise(raw.rate, 'rate', { allowZero: true });
    const bp = rateBp(raw.gstRate) ?? item?.gst_rate_bp ?? 0;
    const taxable = Math.round(qty * rate);
    lines.push({
      itemId: item?.id || null,
      description: text(raw.description, 120) || item?.name || 'Item',
      hsn: orNull(text(raw.hsn, 8)) || item?.hsn || null,
      qty,
      unit: text(raw.unit, 12) || item?.uom || 'nos',
      rate,
      bp,
      taxable,
      ...taxOn(taxable, bp, interstate),
    });
  }
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const taxable = sum('taxable');
  const exact = taxable + sum('tax');
  // The total as printed on the bill, when typed: it may differ from the
  // worked-out total by its rounding (at most ₹1). Otherwise round to the rupee.
  let total = Math.round(exact / 100) * 100;
  if (body.totalAsBilled != null && body.totalAsBilled !== '') {
    const typed = toPaise(body.totalAsBilled, 'totalAsBilled');
    if (Math.abs(typed - exact) > 100) {
      throw new InputError(`The lines add up to ${rupees(exact)}, but the bill says ${rupees(typed)}. Check the quantities, rates and GST.`, { totalAsBilled: `Lines add up to ${rupees(exact)}.` });
    }
    total = typed;
  }
  const due = cleanDate(body.dueDate, 'dueDate', null) || (await one(client, 'SELECT ($1::date + $2::int)::text AS d', [billDate, supplier.terms_days || 0])).d;
  const no = await number(client, 'purchase_bill', 'PB', billDate);
  const bill = await one(
    client,
    `INSERT INTO purch.bills (number, supplier_bill_no, bill_date, party_id, branch_id, goods_received_id, supplier_gstin, interstate,
       taxable_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise, itc_eligible, due_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [no, billNo, billDate, supplier.id, branch.id, grn?.id || null, gstin, interstate, taxable, sum('cgst'), sum('sgst'), sum('igst'), total - exact, total, body.itcEligible !== false && Boolean(gstin), due, orNull(text(body.notes, 500))],
  );
  let n = 0;
  for (const l of lines) {
    n += 1;
    await client.query(
      `INSERT INTO purch.bill_lines (bill_id, line_no, item_id, description, hsn, qty, unit, rate_paise, gst_rate_bp, taxable_paise, cgst_paise, sgst_paise, igst_paise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [bill.id, n, l.itemId, l.description, l.hsn, l.qty, l.unit, l.rate, l.bp, l.taxable, l.cgst, l.sgst, l.igst],
    );
  }
  return bill.id;
}

export async function cancelBill(client, id, body) {
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Give a reason for cancelling.', { reason: 'Give a reason.' });
  const bill = await one(client, 'SELECT status, number FROM purch.bills WHERE id = $1 FOR UPDATE', [id]);
  if (!bill) throw notFound('Bill');
  if (bill.status !== 'open') throw new InputError('This bill is already cancelled.');
  const paid = await one(
    client,
    "SELECT count(*)::int AS n FROM purch.payment_allocations a JOIN purch.payments p ON p.id = a.payment_id WHERE a.bill_id = $1 AND a.active AND p.status = 'active'",
    [id],
  );
  if (paid.n) throw new InputError('Payments are matched to this bill. Reverse them first.');
  if ((await one(client, 'SELECT count(*)::int AS n FROM purch.returns WHERE bill_id = $1', [id])).n) throw new InputError('A purchase return is recorded against this bill, so it cannot be cancelled.');
  await client.query("UPDATE purch.bills SET status = 'cancelled', cancel_reason = $2, cancelled_at = now(), cancelled_by = core.actor() WHERE id = $1", [id, reason]);
}

export async function listBills(client, { partyId = null, q = '' } = {}) {
  const search = text(q, 40);
  return all(
    client,
    `SELECT b.id, b.number, b.supplier_bill_no, b.bill_date, b.due_date, b.status, b.taxable_paise, b.cgst_paise, b.sgst_paise, b.igst_paise,
            b.total_paise, b.itc_eligible, p.display_name AS supplier, bb.balance_paise, bb.days_overdue
     FROM purch.bills b JOIN party.parties p ON p.id = b.party_id LEFT JOIN purch.bill_balance bb ON bb.bill_id = b.id
     WHERE ($1::bigint IS NULL OR b.party_id = $1) AND ($2 = '' OR b.number ILIKE '%' || $2 || '%' OR b.supplier_bill_no ILIKE '%' || $2 || '%' OR p.display_name ILIKE '%' || $2 || '%')
     ORDER BY b.bill_date DESC, b.id DESC LIMIT 300`,
    [partyId, search],
  );
}

export async function getBill(client, id) {
  const bill = await one(
    client,
    `SELECT b.*, p.display_name AS supplier, bb.balance_paise, bb.paid_paise, bb.debited_paise, bb.days_overdue, r.number AS goods_received_number
     FROM purch.bills b JOIN party.parties p ON p.id = b.party_id LEFT JOIN purch.bill_balance bb ON bb.bill_id = b.id
     LEFT JOIN purch.receipts r ON r.id = b.goods_received_id WHERE b.id = $1`,
    [id],
  );
  if (!bill) throw notFound('Bill');
  const [lines, payments, returns] = await Promise.all([
    all(client, 'SELECT * FROM purch.bill_lines WHERE bill_id = $1 ORDER BY line_no', [id]),
    all(
      client,
      `SELECT a.amount_paise, a.active, p.number, p.payment_date, p.method, p.status FROM purch.payment_allocations a
       JOIN purch.payments p ON p.id = a.payment_id WHERE a.bill_id = $1 ORDER BY a.id`,
      [id],
    ),
    all(client, 'SELECT id, number, return_date, total_paise FROM purch.returns WHERE bill_id = $1 ORDER BY id', [id]),
  ]);
  return { ...bill, lines, payments, returns };
}

// ---- Paying suppliers ----
export const SUPPLIER_PAY_METHODS = ['cash', 'upi', 'bank', 'cheque', 'other'];

async function allocatePayment(client, payment, allocations) {
  let left = (await one(client, 'SELECT unallocated_paise FROM purch.payment_balance WHERE payment_id = $1', [payment.id])).unallocated_paise;
  const plan = [];
  if (Array.isArray(allocations) && allocations.length) {
    for (const a of allocations) plan.push({ billId: Number(a.billId), amount: toPaise(a.amount, 'allocation') });
  } else {
    // Oldest unpaid bill first.
    const open = await all(client, 'SELECT bill_id, balance_paise FROM purch.bill_balance WHERE party_id = $1 AND balance_paise > 0 ORDER BY bill_date, bill_id', [payment.party_id]);
    for (const b of open) {
      if (left <= 0) break;
      const amount = Math.min(left, b.balance_paise);
      plan.push({ billId: b.bill_id, amount });
      left -= amount;
    }
  }
  for (const p of plan) {
    const bill = await one(client, "SELECT id, number, party_id FROM purch.bills WHERE id = $1 AND status = 'open' FOR UPDATE", [p.billId]);
    if (!bill || bill.party_id !== payment.party_id) throw new InputError('That bill is not this supplier’s, or it is cancelled.');
    const bal = (await one(client, 'SELECT balance_paise FROM purch.bill_balance WHERE bill_id = $1', [bill.id])).balance_paise;
    if (p.amount > bal) throw new InputError(`Bill ${bill.number} has only ${rupees(bal)} left to pay.`);
    await client.query('INSERT INTO purch.payment_allocations (payment_id, bill_id, amount_paise) VALUES ($1, $2, $3)', [payment.id, bill.id, p.amount]);
  }
}

export async function createSupplierPayment(client, body) {
  const supplier = await supplierOf(client, body.partyId);
  if (!SUPPLIER_PAY_METHODS.includes(body.method)) throw new InputError('Choose how it was paid.', { method: 'Choose one.' });
  const amount = toPaise(body.amount, 'amount');
  const date = cleanDate(body.date, 'date', await today(client));
  const reference = orNull(text(body.reference, 80));
  if (['upi', 'bank', 'cheque'].includes(body.method) && !reference) {
    throw new InputError('Enter the reference (UTR or cheque number), so the payment can be traced.', { reference: 'Enter the reference.' });
  }
  const no = await number(client, 'supplier_payment', 'PAY', date);
  const payment = await one(
    client,
    'INSERT INTO purch.payments (number, payment_date, party_id, method, reference, amount_paise, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, party_id',
    [no, date, supplier.id, body.method, reference, amount, orNull(text(body.notes, 500))],
  );
  if (body.allocate !== false) await allocatePayment(client, payment, body.allocations);
  return payment.id;
}

export async function allocateSupplierPayment(client, id, body) {
  const payment = await one(client, "SELECT id, party_id FROM purch.payments WHERE id = $1 AND status = 'active' FOR UPDATE", [id]);
  if (!payment) throw notFound('Payment');
  await allocatePayment(client, payment, body.allocations);
}

export async function reverseSupplierPayment(client, id, body) {
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Give a reason for reversing the payment.', { reason: 'Give a reason.' });
  const p = await one(client, 'SELECT status FROM purch.payments WHERE id = $1 FOR UPDATE', [id]);
  if (!p) throw notFound('Payment');
  if (p.status !== 'active') throw new InputError('This payment is already reversed.');
  await client.query('UPDATE purch.payment_allocations SET active = false WHERE payment_id = $1 AND active', [id]);
  await client.query("UPDATE purch.payments SET status = 'reversed', reversed_at = now(), reversed_by = core.actor(), reverse_reason = $2 WHERE id = $1", [id, reason]);
}

export async function listSupplierPayments(client, { partyId = null } = {}) {
  return all(
    client,
    `SELECT p.id, p.number, p.payment_date, p.method, p.reference, p.amount_paise, p.status, p.reverse_reason, s.display_name AS supplier,
            pb.unallocated_paise
     FROM purch.payments p JOIN party.parties s ON s.id = p.party_id LEFT JOIN purch.payment_balance pb ON pb.payment_id = p.id
     WHERE ($1::bigint IS NULL OR p.party_id = $1) ORDER BY p.payment_date DESC, p.id DESC LIMIT 300`,
    [partyId],
  );
}

export async function payables(client) {
  return all(
    client,
    `SELECT sb.*, p.display_name AS supplier, p.phone, sp.terms_days, sp.supplier_type
     FROM purch.supplier_balance sb JOIN party.parties p ON p.id = sb.party_id LEFT JOIN party.supplier_profiles sp ON sp.party_id = p.id
     WHERE sb.billed_due_paise <> 0 OR sb.advance_paise <> 0
     ORDER BY sb.overdue_paise DESC, sb.net_due_paise DESC`,
  );
}

export async function supplierAccount(client, partyId) {
  const [balance, bills, payments] = await Promise.all([
    one(client, 'SELECT * FROM purch.supplier_balance WHERE party_id = $1', [partyId]),
    all(client, 'SELECT * FROM purch.bill_balance WHERE party_id = $1 AND balance_paise <> 0 ORDER BY bill_date, bill_id', [partyId]),
    listSupplierPayments(client, { partyId }),
  ]);
  return { balance, bills, payments };
}

// ---- Purchase returns (debit notes) ----
export async function createPurchaseReturn(client, body) {
  const supplier = await supplierOf(client, body.partyId);
  const place = await placeOf(client, body.locationId);
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Say why the goods are going back.', { reason: 'Give a reason.' });
  const bill = body.billId ? await one(client, "SELECT * FROM purch.bills WHERE id = $1 AND status = 'open' FOR UPDATE", [Number(body.billId)]) : null;
  if (body.billId && (!bill || bill.party_id !== supplier.id)) throw new InputError('That bill is not this supplier’s, or it is cancelled.', { billId: 'Not this supplier’s.' });
  const interstate = bill ? bill.interstate : Boolean(supplier.gstin && supplier.gstin.slice(0, 2) !== place.state_code);
  const rawLines = Array.isArray(body.lines) ? body.lines.filter((l) => l && l.itemId) : [];
  if (!rawLines.length) throw new InputError('Add what is going back.');
  const date = cleanDate(body.returnDate, 'returnDate', await today(client));
  const lines = [];
  for (const raw of rawLines) {
    const item = await itemOf(client, raw.itemId);
    const qty = whole(raw.qty, 'qty', { label: 'the quantity' });
    const batchId = raw.batchId ? Number(raw.batchId) : null;
    await needFree(client, place.id, item, qty, batchId);
    const rate = toPaise(raw.rate, 'rate', { allowZero: true });
    const bp = rateBp(raw.gstRate) ?? item.gst_rate_bp;
    const taxable = rate * qty;
    lines.push({ item, qty, batchId, rate, bp, taxable, ...taxOn(taxable, bp, interstate) });
  }
  const sum = (k) => lines.reduce((s, l) => s + l[k], 0);
  const total = sum('taxable') + sum('tax');
  if (bill) {
    const bal = (await one(client, 'SELECT balance_paise FROM purch.bill_balance WHERE bill_id = $1', [bill.id])).balance_paise;
    if (total > bal) throw new InputError(`This return is worth ${rupees(total)}, but only ${rupees(bal)} is unpaid on bill ${bill.number}.`);
  }
  const no = await number(client, 'debit_note', 'DN', date);
  const ret = await one(
    client,
    `INSERT INTO purch.returns (number, return_date, party_id, bill_id, location_id, reason, interstate, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [no, date, supplier.id, bill?.id || null, place.id, reason, interstate, sum('taxable'), sum('cgst'), sum('sgst'), sum('igst'), total],
  );
  for (const l of lines) {
    await client.query(
      'INSERT INTO purch.return_lines (return_id, item_id, batch_id, qty, rate_paise, gst_rate_bp, taxable_paise, tax_paise) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [ret.id, l.item.id, l.batchId, l.qty, l.rate, l.bp, l.taxable, l.tax],
    );
    const plan = l.batchId ? [{ batchId: l.batchId, qty: l.qty }] : await pickBatches(client, place.id, l.item.id, l.qty);
    for (const p of plan) {
      await move(client, { locationId: place.id, itemId: l.item.id, batchId: p.batchId, type: 'purchase_return', onHand: -p.qty, refType: 'purchase_return', refId: ret.id, refNumber: no, reason });
    }
  }
  return ret.id;
}

export async function listPurchaseReturns(client) {
  return all(
    client,
    `SELECT r.id, r.number, r.return_date, r.reason, r.total_paise, p.display_name AS supplier, b.number AS bill_number, b.supplier_bill_no
     FROM purch.returns r JOIN party.parties p ON p.id = r.party_id LEFT JOIN purch.bills b ON b.id = r.bill_id ORDER BY r.id DESC LIMIT 300`,
  );
}

// ---- Packing runs ----
export async function createPackingRun(client, body) {
  const place = await placeOf(client, body.locationId);
  const inputs = Array.isArray(body.inputs) ? body.inputs.filter((l) => l && l.itemId) : [];
  const outputs = Array.isArray(body.outputs) ? body.outputs.filter((l) => l && l.itemId) : [];
  if (!outputs.length) throw new InputError('Add the packed bags that came out.');
  const date = cleanDate(body.runDate, 'runDate', await today(client));
  const no = await number(client, 'packing_run', 'PK', date);
  const run = await one(client, 'INSERT INTO inv.packing_runs (number, location_id, run_date, notes) VALUES ($1, $2, $3, $4) RETURNING id', [no, place.id, date, orNull(text(body.notes, 500))]);
  const ref = { locationId: place.id, refType: 'packing_run', refId: run.id, refNumber: no };
  let inKg = 0;
  let outKg = 0;
  for (const raw of inputs) {
    const item = await itemOf(client, raw.itemId);
    const qty = whole(raw.qty, 'qty', { label: 'the quantity used' });
    const batchId = raw.batchId ? Number(raw.batchId) : null;
    await needFree(client, place.id, item, qty, batchId);
    const plan = batchId ? [{ batchId, qty }] : await pickBatches(client, place.id, item.id, qty);
    for (const p of plan) {
      await client.query("INSERT INTO inv.packing_lines (run_id, direction, item_id, batch_id, qty) VALUES ($1, 'in', $2, $3, $4)", [run.id, item.id, p.batchId, p.qty]);
      await move(client, { ...ref, itemId: item.id, batchId: p.batchId, type: 'pack_in', onHand: -p.qty, reason: 'Used in packing' });
    }
    if (item.kind === 'raw') inKg += item.uom === 'kg' ? qty : item.uom === 'quintal' ? qty * 100 : ((item.net_weight_g || 0) / 1000) * qty;
  }
  for (const raw of outputs) {
    const item = await itemOf(client, raw.itemId);
    if (item.kind !== 'finished') throw new InputError(`${item.name} is not a packed product.`, { itemId: 'Choose a pack.' });
    const qty = whole(raw.qty, 'qty', { label: 'the bags packed' });
    const batchId = await newBatch(client, item, raw.batch, { source: 'packing', packedOn: date });
    await client.query("INSERT INTO inv.packing_lines (run_id, direction, item_id, batch_id, qty) VALUES ($1, 'out', $2, $3, $4)", [run.id, item.id, batchId, qty]);
    await move(client, { ...ref, itemId: item.id, batchId, type: 'pack_out', onHand: qty, reason: 'Packed' });
    outKg += ((item.net_weight_g || 0) / 1000) * qty;
  }
  if (inKg && outKg > inKg * 1.001) throw new InputError(`The packed bags weigh ${outKg} kg, more than the ${inKg} kg of rice used. Check the numbers.`);
  return run.id;
}

export async function listPackingRuns(client) {
  const runs = await all(
    client,
    `SELECT r.id, r.number, r.run_date, r.notes, r.created_by, l.name AS location FROM inv.packing_runs r JOIN org.locations l ON l.id = r.location_id ORDER BY r.id DESC LIMIT 200`,
  );
  if (!runs.length) return runs;
  const lines = await all(
    client,
    `SELECT pl.run_id, pl.direction, pl.qty, i.name AS item_name, i.pack_label, i.uom, i.kind, i.net_weight_g, b.code AS batch_code
     FROM inv.packing_lines pl JOIN catalog.items i ON i.id = pl.item_id LEFT JOIN inv.batches b ON b.id = pl.batch_id WHERE pl.run_id = ANY($1)`,
    [runs.map((r) => r.id)],
  );
  return runs.map((r) => ({ ...r, inputs: lines.filter((l) => l.run_id === r.id && l.direction === 'in'), outputs: lines.filter((l) => l.run_id === r.id && l.direction === 'out') }));
}

// ---- Stock changes asked for by staff ----
const EFFECT = {
  adjust: (n) => ({ onHand: n }),
  damage: (n) => ({ onHand: -Math.abs(n), damaged: Math.abs(n) }),
  write_off: (n) => ({ damaged: -Math.abs(n) }),
};

export async function createStockRequest(client, body) {
  const place = await placeOf(client, body.locationId);
  const item = await itemOf(client, body.itemId);
  if (!EFFECT[body.kind]) throw new InputError('Choose what kind of change this is.', { kind: 'Choose one.' });
  const qty = Number(body.qty);
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > 100_000) throw new InputError('Enter a whole number of bags.', { qty: 'A whole number.' });
  const reason = text(body.reason, 300);
  if (reason.length < 3) throw new InputError('Say what happened, so the manager can decide.', { reason: 'Give a reason.' });
  const no = await number(client, 'stock_request', 'SR', await today(client));
  return (
    await one(
      client,
      'INSERT INTO inv.stock_requests (number, location_id, item_id, batch_id, kind, qty, reason) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [no, place.id, item.id, body.batchId ? Number(body.batchId) : null, body.kind, body.kind === 'adjust' ? qty : Math.abs(qty), reason],
    )
  ).id;
}

export async function decideStockRequest(client, id, body) {
  const r = await one(client, 'SELECT * FROM inv.stock_requests WHERE id = $1 FOR UPDATE', [id]);
  if (!r) throw notFound('Request');
  if (r.status !== 'pending') throw new InputError(`This request is already ${r.status}.`);
  const note = text(body.note, 300);
  if (body.decision === 'rejected') {
    if (!note) throw new InputError('Say why it is turned down.', { note: 'Give a reason.' });
  } else if (body.decision === 'approved') {
    const effect = EFFECT[r.kind](r.qty);
    if ((effect.onHand || 0) < 0) {
      const item = await itemOf(client, r.item_id);
      await needFree(client, r.location_id, item, -effect.onHand, r.batch_id);
    }
    await move(client, { locationId: r.location_id, itemId: r.item_id, batchId: r.batch_id, type: r.kind, ...effect, refType: 'stock_request', refId: r.id, refNumber: r.number, reason: `${r.reason} (asked by ${r.requested_by})` });
  } else throw new InputError('Approve or turn down the request.');
  await client.query('UPDATE inv.stock_requests SET status = $2, decided_at = now(), decided_by = core.actor(), decision_note = $3 WHERE id = $1', [id, body.decision, orNull(note)]);
}

export async function listStockRequests(client, { status = '' } = {}) {
  return all(
    client,
    `SELECT r.*, i.name AS item_name, i.pack_label, l.name AS location, b.code AS batch_code
     FROM inv.stock_requests r JOIN catalog.items i ON i.id = r.item_id JOIN org.locations l ON l.id = r.location_id
     LEFT JOIN inv.batches b ON b.id = r.batch_id WHERE ($1 = '' OR r.status = $1) ORDER BY (r.status = 'pending') DESC, r.id DESC LIMIT 300`,
    [String(status)],
  );
}

// ---- Expenses ----
export const EXPENSE_PAID_BY = ['cash', 'upi', 'bank', 'cheque', 'card', 'other'];

export async function listExpenseCategories(client) {
  return all(client, 'SELECT * FROM acct.expense_categories ORDER BY active DESC, name');
}

export async function saveExpenseCategory(client, id, body) {
  const name = text(body.name, 60);
  if (name.length < 2) throw new InputError('Enter a name.', { name: 'Enter a name.' });
  const ledger = orNull(text(body.tallyLedger, 80));
  if (id) {
    const row = await one(client, 'UPDATE acct.expense_categories SET name = $1, tally_ledger = $2, active = $3 WHERE id = $4 RETURNING id', [name, ledger, body.active !== false, id]);
    if (!row) throw notFound('Category');
    return row.id;
  }
  return (await one(client, 'INSERT INTO acct.expense_categories (name, tally_ledger) VALUES ($1, $2) RETURNING id', [name, ledger])).id;
}

export async function createExpense(client, body) {
  const branch = await branchOf(client, body.branchId);
  const category = await one(client, 'SELECT id FROM acct.expense_categories WHERE id = $1 AND active', [Number(body.categoryId)]);
  if (!category) throw new InputError('Choose what the expense was for.', { categoryId: 'Choose one.' });
  const date = cleanDate(body.expenseDate, 'expenseDate', await today(client));
  const payeeParty = body.payeePartyId ? await one(client, 'SELECT id, display_name, gstin FROM party.parties WHERE id = $1', [Number(body.payeePartyId)]) : null;
  const payee = text(body.payeeName, 80) || payeeParty?.display_name || '';
  if (!payee) throw new InputError('Who was paid?', { payeeName: 'Enter who was paid.' });
  const description = text(body.description, 200);
  if (!description) throw new InputError('Say what it was for.', { description: 'Describe it.' });
  if (!EXPENSE_PAID_BY.includes(body.paidBy)) throw new InputError('Choose how it was paid.', { paidBy: 'Choose one.' });
  const gstin = cleanGstin(body.supplierGstin ?? payeeParty?.gstin ?? '', 'supplierGstin');
  const taxable = toPaise(body.amount, 'amount', { allowZero: false });
  const bp = rateBp(body.gstRate) ?? 0;
  const interstate = Boolean(gstin && gstin.slice(0, 2) !== branch.state_code);
  const t = taxOn(taxable, bp, interstate);
  const no = await number(client, 'expense', 'EX', date);
  return (
    await one(
      client,
      `INSERT INTO acct.expenses (number, expense_date, branch_id, category_id, payee_party_id, payee_name, description, bill_no, supplier_gstin,
         taxable_paise, gst_rate_bp, interstate, cgst_paise, sgst_paise, igst_paise, total_paise, itc_eligible, paid_by, reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
      [no, date, branch.id, category.id, payeeParty?.id || null, payee, description, orNull(text(body.billNo, 40)), gstin, taxable, bp, interstate, t.cgst, t.sgst, t.igst, taxable + t.tax, Boolean(gstin) && bp > 0 && body.itcEligible !== false, body.paidBy, orNull(text(body.reference, 80))],
    )
  ).id;
}

export async function cancelExpense(client, id, body) {
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Give a reason for cancelling.', { reason: 'Give a reason.' });
  const row = await one(client, "UPDATE acct.expenses SET status = 'cancelled', cancel_reason = $2, cancelled_at = now(), cancelled_by = core.actor() WHERE id = $1 AND status = 'active' RETURNING id", [id, reason]);
  if (!row) throw new InputError('This expense is not found or already cancelled.');
}

export async function setExpensePhoto(client, id, path) {
  const row = await one(client, "UPDATE acct.expenses SET photo_path = $2 WHERE id = $1 AND status = 'active' RETURNING id", [id, path]);
  if (!row) throw new InputError('This expense is not found or is cancelled.');
}

export async function listExpenses(client, { from = null, to = null, categoryId = null } = {}) {
  const f = cleanDate(from, 'from', null);
  const t = cleanDate(to, 'to', null);
  return all(
    client,
    `SELECT e.*, c.name AS category, b.name AS branch FROM acct.expenses e JOIN acct.expense_categories c ON c.id = e.category_id
     JOIN org.branches b ON b.id = e.branch_id
     WHERE ($1::date IS NULL OR e.expense_date >= $1) AND ($2::date IS NULL OR e.expense_date <= $2) AND ($3::int IS NULL OR e.category_id = $3)
     ORDER BY e.expense_date DESC, e.id DESC LIMIT 500`,
    [f, t, categoryId],
  );
}

export async function expensePhotoPath(client, id) {
  return (await one(client, 'SELECT photo_path FROM acct.expenses WHERE id = $1', [id]))?.photo_path || null;
}
