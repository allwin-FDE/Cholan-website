// Selling on the business database: orders, stock, GST invoices, returns and
// credit notes, payments, what customers owe, and credit control.
//
// Each function takes a client inside a transaction (db/pool.js withTx) as the
// signed-in person. The GST arithmetic and the order steps are the ones the
// old warehouse tool used and tested (lib/warehouse.js); this file applies them
// to the database. Money is whole paise throughout.
import { InputError, toPaise } from './business.js';
import { NEXT_STEPS, amountInWords, canMove, computeTotals } from './warehouse.js';
import { pickBatches } from './inward.js';

export const ORDER_SOURCES = ['phone', 'walk-in', 'whatsapp', 'enquiry', 'website', 'visit', 'other'];
export const RECEIPT_METHODS = ['cash', 'upi', 'bank', 'cheque', 'card', 'razorpay', 'other'];
const LIVE = ['confirmed', 'packing', 'packed', 'dispatched', 'delivered'];
const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const orNull = (value) => (value === '' ? null : value);
const notFound = (what) => Object.assign(new Error(`${what} not found.`), { status: 404 });
const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const one = async (client, sql, values) => (await client.query(sql, values)).rows[0];
// An address as one line, without repeating a town already written in an earlier part.
const addressLine = (...parts) =>
  parts
    .filter(Boolean)
    .filter((part, i, list) => !list.slice(0, i).some((earlier) => earlier.toLowerCase().includes(String(part).toLowerCase())))
    .join(', ');
const all = async (client, sql, values) => (await client.query(sql, values)).rows;

function cleanDate(value, field, fallback = null) {
  if (value == null || value === '') return fallback;
  const v = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new InputError('Choose a date.', { [field]: 'Choose a date.' });
  return v;
}
const qtyOf = (value, field = 'qty') => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100_000) throw new InputError('Bags must be a whole number.', { [field]: 'A whole number of bags.' });
  return n;
};
const today = async (client) => (await one(client, 'SELECT core.today_ist()::text AS d')).d;
const fyOf = async (client, date) => (await one(client, 'SELECT core.fy($1::date) AS fy', [date])).fy;

// The selling branch and its main godown (Phase 2 runs one branch).
// The selling branch and its main godown: the one asked for, or the first.
export async function mainPlace(client, branchId = null) {
  const place = await one(
    client,
    `SELECT b.id AS branch_id, b.state_code, b.gst_registration_id, l.id AS location_id
     FROM org.branches b JOIN org.locations l ON l.branch_id = b.id AND l.kind = 'godown' AND l.active
     WHERE b.active AND b.holds_stock AND ($1::smallint IS NULL OR b.id = $1) ORDER BY b.id, l.id LIMIT 1`,
    [branchId ? Number(branchId) : null],
  );
  if (!place) throw new InputError('No branch with a godown is set up yet.');
  return place;
}

// ---- Stock ----
async function stockMove(client, m) {
  return client.query(
    `INSERT INTO inv.stock_moves (location_id, item_id, type, on_hand_change, reserved_change, damaged_change, ref_type, ref_id, ref_number, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [m.locationId, m.itemId, m.type, m.onHand || 0, m.reserved || 0, m.damaged || 0, m.refType || null, m.refId || null, m.refNumber || null, m.reason || null],
  );
}

async function available(client, locationId, itemId) {
  const b = await one(client, 'SELECT on_hand - reserved AS available FROM inv.stock_balances WHERE location_id = $1 AND item_id = $2', [locationId, itemId]);
  return b?.available ?? 0;
}

export async function listStock(client, { locationId = null } = {}) {
  const place = locationId ? { location_id: Number(locationId) } : await mainPlace(client);
  return all(
    client,
    `SELECT i.id AS item_id, i.sku_code, i.name, i.pack_label, i.kind, i.low_stock_level, p.name AS product_name,
            coalesce(b.on_hand, 0) AS on_hand, coalesce(b.reserved, 0) AS reserved, coalesce(b.damaged, 0) AS damaged,
            coalesce(b.on_hand - b.reserved, 0) AS available,
            (i.low_stock_level IS NOT NULL AND coalesce(b.on_hand - b.reserved, 0) <= i.low_stock_level) AS low
     FROM catalog.items i LEFT JOIN catalog.products p ON p.id = i.product_id
     LEFT JOIN inv.stock_balances b ON b.item_id = i.id AND b.location_id = $1
     WHERE i.active ORDER BY p.name NULLS LAST, i.net_weight_g NULLS LAST, i.sku_code`,
    [place.location_id],
  );
}

export async function stockMoves(client, itemId) {
  return all(
    client,
    `SELECT m.id, m.at, m.actor, m.type, m.on_hand_change, m.reserved_change, m.damaged_change, m.on_hand_after,
            m.reserved_after, m.damaged_after, m.ref_type, m.ref_id, m.ref_number, m.reason
     FROM inv.stock_moves m WHERE m.item_id = $1 ORDER BY m.id DESC LIMIT 300`,
    [itemId],
  );
}

// Opening count, goods received, a counted correction, bags found damaged, or
// damaged bags thrown away. Admin and Owner only (the route checks).
export async function adjustStock(client, body) {
  const place = body.locationId ? { location_id: Number(body.locationId) } : await mainPlace(client);
  const item = await one(client, 'SELECT id, name FROM catalog.items WHERE id = $1', [Number(body.itemId)]);
  if (!item) throw notFound('Item');
  const kind = body.kind;
  const reason = text(body.reason, 300);
  const n = Number(body.qty);
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 100_000) throw new InputError('Enter a whole number of bags.', { qty: 'A whole number of bags.' });
  const effect = {
    opening: { onHand: n },
    receive: { onHand: n },
    adjust: { onHand: n },
    damage: { onHand: -Math.abs(n), damaged: Math.abs(n) },
    write_off: { damaged: -Math.abs(n) },
  }[kind];
  if (!effect) throw new InputError('Choose what kind of stock change this is.', { kind: 'Choose one.' });
  if (['opening', 'receive'].includes(kind) && n < 0) throw new InputError('Enter the number of bags (more than zero).', { qty: 'More than zero.' });
  if (kind !== 'opening' && !reason) throw new InputError('Give a reason, so the change can be understood later.', { reason: 'Give a reason.' });
  const pre = await available(client, place.location_id, item.id);
  if ((effect.onHand || 0) < 0 && pre + effect.onHand < 0) {
    throw new InputError(`Only ${pre} bags of ${item.name} are free (not promised to orders), so ${Math.abs(effect.onHand)} cannot be taken out.`, { qty: `At most ${pre}.` });
  }
  await stockMove(client, { locationId: place.location_id, itemId: item.id, type: kind, ...effect, refType: 'adjustment', reason: reason || 'Opening stock' });
}

// ---- Prices for an order ----
async function priceLines(client, partyId, rawLines, onDate, { canSetPrice }) {
  if (!Array.isArray(rawLines) || !rawLines.length) throw new InputError('Add at least one pack to the order.', { lines: 'Add a pack.' });
  if (rawLines.length > 50) throw new InputError('An order can have up to 50 lines.');
  const lines = [];
  for (const [index, raw] of rawLines.entries()) {
    const item = await one(client, "SELECT id, name, sku_code, hsn, gst_rate_bp, active, kind FROM catalog.items WHERE id = $1", [Number(raw.itemId)]);
    if (!item || item.kind !== 'finished' || !item.active) throw new InputError(`Line ${index + 1}: choose a pack that is sold.`, { lines: 'Choose a pack.' });
    const qty = qtyOf(raw.qty);
    let unit;
    let source;
    let includesGst = null;
    if (raw.price !== undefined && raw.price !== null && raw.price !== '') {
      if (!canSetPrice) throw new InputError('Only Admin and Owner can type a price by hand.', { lines: 'Leave the price for the system to fill.' });
      unit = toPaise(raw.price, 'price', { allowZero: true });
      source = 'manual';
    } else {
      const r = await one(client, 'SELECT * FROM price.resolve($1, $2, $3, $4::date)', [partyId, item.id, qty, onDate]);
      if (!r) throw new InputError(`There is no price for ${item.name} on this customer's list or the website list. An Admin can set one in Price lists, or type it by hand.`);
      unit = r.price_paise;
      source = r.source;
      includesGst = r.includes_gst;
    }
    lines.push({ item, qty, unit, source, includesGst });
  }
  return lines;
}

async function partyForOrder(client, partyId) {
  const party = await one(
    client,
    `SELECT p.id, p.display_name, p.legal_name, p.gstin, p.phone, p.is_customer, p.active, cp.credit_limit_paise, cp.credit_status,
            cp.terms_days, coalesce(pl.includes_gst, (SELECT includes_gst FROM price.price_lists WHERE is_default)) AS includes_gst
     FROM party.parties p LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id LEFT JOIN price.price_lists pl ON pl.id = cp.price_list_id
     WHERE p.id = $1`,
    [partyId],
  );
  if (!party) throw notFound('Customer');
  if (!party.is_customer || !party.active) throw new InputError('Choose an active customer.', { partyId: 'Choose an active customer.' });
  return party;
}

async function shipTo(client, party, addressId) {
  const address = await one(
    client,
    `SELECT * FROM party.addresses WHERE party_id = $1 AND active AND ($2::bigint IS NULL OR id = $2)
     ORDER BY (kind IN ('shipping', 'both')) DESC, is_default DESC, id LIMIT 1`,
    [party.id, addressId || null],
  );
  if (addressId && !address) throw notFound('Address');
  if (!address) return null;
  return {
    name: party.legal_name || party.display_name,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    district: address.district,
    state_code: address.state_code,
    pincode: address.pincode,
    gstin: address.gstin || party.gstin,
    phone: party.phone,
  };
}

// The order as it would be priced, with stock and credit, before saving it.
export async function previewOrder(client, body, { canSetPrice }) {
  const party = await partyForOrder(client, Number(body.partyId));
  const place = await mainPlace(client, body.branchId);
  const date = await today(client);
  const lines = await priceLines(client, party.id, body.lines, date, { canSetPrice });
  const ship = await shipTo(client, party, body.addressId ? Number(body.addressId) : null);
  const pos = ship?.state_code || place.state_code;
  const includes = lines.find((l) => l.includesGst != null)?.includesGst ?? party.includes_gst;
  const totals = computeTotals(lines.map((l) => ({ unitPaise: l.unit, qty: l.qty, gstRate: l.item.gst_rate_bp / 100 })), { inclusive: includes, interstate: pos !== place.state_code });
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  return {
    lines: await Promise.all(
      lines.map(async (l) => ({
        itemId: l.item.id,
        name: l.item.name,
        qty: l.qty,
        unitPaise: l.unit,
        source: l.source,
        available: await available(client, place.location_id, l.item.id),
      })),
    ),
    subtotalPaise: subtotal,
    totalPaise: totals.totalPaise,
    taxPaise: totals.cgstPaise + totals.sgstPaise + totals.igstPaise,
    includesGst: includes,
    shipTo: ship,
    credit: await creditCheck(client, party.id, subtotal, { lock: false }),
  };
}

export async function createOrder(client, body, { canSetPrice }) {
  const party = await partyForOrder(client, Number(body.partyId));
  const place = await mainPlace(client, body.branchId);
  const date = await today(client);
  const lines = await priceLines(client, party.id, body.lines, date, { canSetPrice });
  const kinds = new Set(lines.filter((l) => l.includesGst != null).map((l) => l.includesGst));
  if (kinds.size > 1) throw new InputError('This order mixes prices with and without GST. Use one price list for the whole order.');
  const includes = [...kinds][0] ?? party.includes_gst;
  // A pickup from the shop has no delivery address.
  const ship = body.pickup ? null : await shipTo(client, party, body.addressId ? Number(body.addressId) : null);
  const source = ORDER_SOURCES.includes(body.source) ? body.source : 'phone';
  const number = (await one(client, "SELECT core.next_number('order', 'all', 'all', 'CO-', 5::smallint) AS n")).n;
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const order = await one(
    client,
    `INSERT INTO sales.orders (number, branch_id, party_id, source, order_date, ship_to, place_of_supply, includes_gst, subtotal_paise, notes, enquiry_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [number, place.branch_id, party.id, source, date, ship, ship?.state_code || place.state_code, includes, subtotal, orNull(text(body.notes, 1000)), orNull(text(body.enquiryRef, 60))],
  );
  for (const [index, l] of lines.entries()) {
    await client.query(
      `INSERT INTO sales.order_lines (order_id, line_no, item_id, qty, unit_price_paise, price_source, gst_rate_bp, hsn)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [order.id, index + 1, l.item.id, l.qty, l.unit, l.source, l.item.gst_rate_bp, l.item.hsn],
    );
  }
  await event(client, order.id, 'created', null, 'new', `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}, ${rupees(subtotal)}`);
  return order.id;
}

// A new order's lines, address or notes can still change.
export async function editOrder(client, id, body, { canSetPrice }) {
  const order = await one(client, 'SELECT * FROM sales.orders WHERE id = $1 FOR UPDATE', [id]);
  if (!order) throw notFound('Order');
  if (order.status !== 'new') throw new InputError('Only a new order can be changed. Cancel it and take a new one instead.');
  if (body.lines) {
    const lines = await priceLines(client, order.party_id, body.lines, order.order_date, { canSetPrice });
    const kinds = new Set(lines.filter((l) => l.includesGst != null).map((l) => l.includesGst));
    if (kinds.size > 1) throw new InputError('This order mixes prices with and without GST. Use one price list for the whole order.');
    await client.query('UPDATE sales.order_lines SET active = false WHERE order_id = $1 AND active', [id]);
    const start = (await one(client, 'SELECT coalesce(max(line_no), 0) AS n FROM sales.order_lines WHERE order_id = $1', [id])).n;
    for (const [index, l] of lines.entries()) {
      await client.query(
        `INSERT INTO sales.order_lines (order_id, line_no, item_id, qty, unit_price_paise, price_source, gst_rate_bp, hsn)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, start + index + 1, l.item.id, l.qty, l.unit, l.source, l.item.gst_rate_bp, l.item.hsn],
      );
    }
    const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
    await client.query('UPDATE sales.orders SET subtotal_paise = $2, includes_gst = coalesce($3, includes_gst) WHERE id = $1', [id, subtotal, [...kinds][0] ?? null]);
    await event(client, id, 'lines changed', null, null, `${lines.length} lines, ${rupees(subtotal)}`);
  }
  if (body.addressId !== undefined) {
    const party = await partyForOrder(client, order.party_id);
    const ship = await shipTo(client, party, body.addressId ? Number(body.addressId) : null);
    const place = await mainPlace(client);
    await client.query('UPDATE sales.orders SET ship_to = $2, place_of_supply = $3 WHERE id = $1', [id, ship, ship?.state_code || place.state_code]);
  }
  if (body.notes !== undefined) await client.query('UPDATE sales.orders SET notes = $2 WHERE id = $1', [id, orNull(text(body.notes, 1000))]);
  if (body.source !== undefined && ORDER_SOURCES.includes(body.source)) await client.query('UPDATE sales.orders SET source = $2 WHERE id = $1', [id, body.source]);
}

const event = (client, orderId, action, from, to, detail) =>
  client.query('INSERT INTO sales.order_events (order_id, action, from_status, to_status, detail) VALUES ($1, $2, $3, $4, $5)', [orderId, action, from, to, detail || null]);

// ---- Credit control ----
// What the customer owes plus orders not yet invoiced plus this one must fit
// the limit (when they have one), nothing may be overdue, and a customer on
// hold or blocked cannot take new goods. The customer's profile is locked so
// two orders confirmed at once are counted one after the other.
export async function creditCheck(client, partyId, extraPaise, { lock = true } = {}) {
  const profile = await one(client, `SELECT credit_limit_paise, credit_status, terms_days FROM party.customer_profiles WHERE party_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [partyId]);
  const b = await one(client, 'SELECT * FROM sales.party_balance WHERE party_id = $1', [partyId]);
  const limit = profile?.credit_limit_paise || 0;
  const exposure = (b?.net_due_paise || 0) + (b?.open_orders_paise || 0) + extraPaise;
  const problems = [];
  if (profile?.credit_status === 'hold') problems.push('the customer is on hold');
  if (profile?.credit_status === 'blocked') problems.push('the customer is blocked');
  if (b?.overdue_invoices > 0) problems.push(`${b.overdue_invoices} ${b.overdue_invoices === 1 ? 'invoice is' : 'invoices are'} overdue (oldest ${b.oldest_overdue_days} days, ${rupees(b.overdue_paise)})`);
  if (limit > 0 && exposure > limit) problems.push(`this would take them to ${rupees(exposure)} against a limit of ${rupees(limit)}`);
  return {
    ok: problems.length === 0,
    problems,
    limitPaise: limit,
    netDuePaise: b?.net_due_paise || 0,
    openOrdersPaise: b?.open_orders_paise || 0,
    exposurePaise: exposure,
    status: profile?.credit_status || 'active',
  };
}

// ---- Order steps ----
export async function moveOrder(client, id, to, body, { isAdmin }) {
  const order = await one(client, 'SELECT * FROM sales.orders WHERE id = $1 FOR UPDATE', [id]);
  if (!order) throw notFound('Order');
  const from = order.status;
  if (to === 'returned') throw new InputError('Record returned bags with “Return bags”, so stock and the credit note are right.');
  if (!canMove(from, to)) throw new InputError(`An order that is ${from} cannot be marked ${to}.`);
  const reason = text(body.reason, 300);
  if (to === 'cancelled' && !isAdmin) throw new InputError('Only Admin and Owner can cancel an order.');
  if (to === 'cancelled' && !reason) throw new InputError('Give a reason for cancelling.', { reason: 'Give a reason.' });

  const lines = await all(client, 'SELECT * FROM sales.order_lines WHERE order_id = $1 AND active ORDER BY item_id, id', [id]);
  const place = await one(client, "SELECT l.id AS location_id FROM org.locations l WHERE l.branch_id = $1 AND l.kind = 'godown' AND l.active ORDER BY l.id LIMIT 1", [order.branch_id]);
  const ref = { refType: 'order', refId: id, refNumber: order.number, locationId: place.location_id };
  const byItem = new Map();
  for (const l of lines) byItem.set(l.item_id, (byItem.get(l.item_id) || 0) + l.qty);

  if (to === 'confirmed') {
    const check = await creditCheck(client, order.party_id, order.subtotal_paise);
    if (!check.ok) {
      if (!(body.override && isAdmin && reason)) {
        throw Object.assign(new InputError(`This order cannot be confirmed: ${check.problems.join('; ')}.${isAdmin ? ' You can confirm it anyway with a reason.' : ' Ask an Admin or Owner.'}`), { code: 'credit', credit: check });
      }
      await client.query('UPDATE sales.orders SET credit_override_by = core.actor(), credit_override_reason = $2 WHERE id = $1', [id, reason]);
    }
    for (const [itemId, qty] of byItem) {
      const free = await available(client, place.location_id, itemId);
      if (free < qty) {
        const name = (await one(client, 'SELECT name FROM catalog.items WHERE id = $1', [itemId])).name;
        throw new InputError(`Not enough ${name}: ${free} ${free === 1 ? 'bag is' : 'bags are'} free, the order needs ${qty}.`);
      }
      await stockMove(client, { ...ref, itemId, type: 'reserve', reserved: qty });
    }
  }
  if (to === 'cancelled' && ['awaiting_payment', 'confirmed', 'packing', 'packed'].includes(from)) {
    const live = await one(client, "SELECT number FROM sales.invoices WHERE order_id = $1 AND status = 'issued'", [id]);
    if (live) throw new InputError(`Cancel invoice ${live.number} first.`);
    for (const [itemId, qty] of byItem) await stockMove(client, { ...ref, itemId, type: 'release', reserved: -qty, reason });
  }
  if (to === 'dispatched') {
    if (!(await one(client, "SELECT 1 FROM sales.invoices WHERE order_id = $1 AND status = 'issued'", [id]))) await createInvoice(client, id, {});
    for (const [itemId, qty] of byItem) {
      for (const p of await pickBatches(client, place.location_id, itemId, qty)) {
        await client.query(
          `INSERT INTO inv.stock_moves (location_id, item_id, batch_id, type, on_hand_change, reserved_change, ref_type, ref_id, ref_number)
           VALUES ($1, $2, $3, 'dispatch', $4, $4, 'order', $5, $6)`,
          [place.location_id, itemId, p.batchId, -p.qty, id, order.number],
        );
      }
    }
    await client.query(
      `INSERT INTO sales.dispatches (order_id, dispatched_on) VALUES ($1, core.today_ist())
       ON CONFLICT (order_id) DO UPDATE SET dispatched_on = coalesce(sales.dispatches.dispatched_on, EXCLUDED.dispatched_on)`,
      [id],
    );
  }
  await client.query('UPDATE sales.orders SET status = $2, cancel_reason = CASE WHEN $2 = \'cancelled\' THEN $3 ELSE cancel_reason END WHERE id = $1', [id, to, reason || null]);
  const overridden = to === 'confirmed' && body.override && isAdmin && reason;
  await event(client, id, to === 'cancelled' ? 'cancelled' : `marked ${to}`, from, to, overridden ? `confirmed over the credit check: ${reason}` : reason || null);
}

export async function saveDispatch(client, orderId, body) {
  const order = await one(client, 'SELECT status FROM sales.orders WHERE id = $1', [orderId]);
  if (!order) throw notFound('Order');
  if (['new', 'cancelled'].includes(order.status)) throw new InputError('Confirm the order before adding dispatch details.');
  const vehicle = text(body.vehicleNo, 15).toUpperCase();
  if (vehicle && !/^[A-Z0-9 -]{4,15}$/.test(vehicle)) throw new InputError('Check the vehicle number.', { vehicleNo: 'Like TN 37 AB 1234.' });
  const eway = text(body.ewayBillNo, 12).replace(/\s/g, '');
  if (eway && !/^[0-9]{12}$/.test(eway)) throw new InputError('An e-way bill number has 12 digits.', { ewayBillNo: '12 digits.' });
  const digits = String(body.driverPhone || '').replace(/\D/g, '');
  const driverPhone = digits ? `+91${digits.slice(-10)}` : null;
  if (driverPhone && !/^\+91[6-9][0-9]{9}$/.test(driverPhone)) throw new InputError('Enter the driver’s 10-digit mobile.', { driverPhone: '10 digits.' });
  await client.query(
    `INSERT INTO sales.dispatches (order_id, dispatched_on, vehicle_no, driver_name, driver_phone, transporter, lr_no, lr_date, eway_bill_no, eway_valid_until, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (order_id) DO UPDATE SET dispatched_on = EXCLUDED.dispatched_on, vehicle_no = EXCLUDED.vehicle_no, driver_name = EXCLUDED.driver_name,
       driver_phone = EXCLUDED.driver_phone, transporter = EXCLUDED.transporter, lr_no = EXCLUDED.lr_no, lr_date = EXCLUDED.lr_date,
       eway_bill_no = EXCLUDED.eway_bill_no, eway_valid_until = EXCLUDED.eway_valid_until, notes = EXCLUDED.notes`,
    [
      orderId,
      cleanDate(body.dispatchedOn, 'dispatchedOn'),
      orNull(vehicle),
      orNull(text(body.driverName, 80)),
      driverPhone,
      orNull(text(body.transporter, 120)),
      orNull(text(body.lrNo, 40)),
      cleanDate(body.lrDate, 'lrDate'),
      orNull(eway),
      cleanDate(body.ewayValidUntil, 'ewayValidUntil'),
      orNull(text(body.notes, 500)),
    ],
  );
  await event(client, orderId, 'dispatch details saved', null, null, [vehicle, text(body.lrNo, 40) && `LR ${text(body.lrNo, 40)}`, eway && `e-way ${eway}`].filter(Boolean).join(', '));
}

// ---- Invoices ----
async function sellerFor(client, branchId) {
  const s = await one(
    client,
    `SELECT c.legal_name, c.brand_name, c.cin, c.pan, c.phone, c.email, r.id AS registration_id, r.gstin, r.state_code, r.address AS registered_address,
            b.address_line1, b.address_line2, b.city, b.pincode, b.fssai_licence
     FROM org.branches b JOIN org.gst_registrations r ON r.id = b.gst_registration_id CROSS JOIN org.company c WHERE b.id = $1`,
    [branchId],
  );
  if (!s) throw new InputError('The company details are not set up.');
  return s;
}

async function buyerFor(client, order) {
  const party = await one(client, 'SELECT * FROM party.parties WHERE id = $1', [order.party_id]);
  const billing = await one(
    client,
    "SELECT * FROM party.addresses WHERE party_id = $1 AND active AND kind IN ('billing', 'both') ORDER BY is_default DESC, id LIMIT 1",
    [party.id],
  );
  const address = billing || order.ship_to;
  return {
    name: party.legal_name || party.display_name,
    display_name: party.display_name,
    gstin: billing?.gstin || party.gstin || null,
    phone: party.phone,
    address: address ? addressLine(address.line1, address.line2, address.city, address.pincode) : null,
    state_code: address?.state_code || order.place_of_supply,
  };
}

const taxLines = (lines, { inclusive, interstate }) =>
  computeTotals(
    lines.map((l) => ({ ...l, unitPaise: l.unit_price_paise, gstRate: l.gst_rate_bp / 100 })),
    { inclusive, interstate },
  );

const docTypeOf = (lines) => {
  const rated = lines.filter((l) => l.gst_rate_bp > 0).length;
  return rated === lines.length ? 'tax_invoice' : rated === 0 ? 'bill_of_supply' : 'invoice_cum_bos';
};

export async function createInvoice(client, orderId, body) {
  const order = await one(client, 'SELECT * FROM sales.orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!order) throw notFound('Order');
  if (!LIVE.includes(order.status)) throw new InputError('Confirm the order before invoicing it.');
  const existing = await one(client, "SELECT number FROM sales.invoices WHERE order_id = $1 AND status = 'issued'", [orderId]);
  if (existing) throw new InputError(`This order already has invoice ${existing.number}.`);
  const date = cleanDate(body.invoiceDate, 'invoiceDate', await today(client));
  const fy = await fyOf(client, date);
  const seller = await sellerFor(client, order.branch_id);
  const buyer = await buyerFor(client, order);
  const lines = await all(
    client,
    `SELECT ol.*, i.name AS description FROM sales.order_lines ol JOIN catalog.items i ON i.id = ol.item_id
     WHERE ol.order_id = $1 AND ol.active ORDER BY ol.line_no`,
    [orderId],
  );
  const interstate = order.place_of_supply !== seller.state_code;
  const t = taxLines(lines, { inclusive: order.includes_gst, interstate });
  const exempt = t.lines.filter((l) => l.gst_rate_bp === 0).reduce((s, l) => s + l.taxablePaise, 0);
  const b2clLimit = Number((await one(client, "SELECT value FROM core.settings WHERE key = 'gst.b2cl_limit_paise'"))?.value ?? 10_000_000);
  const supplyType = buyer.gstin ? 'B2B' : interstate && t.totalPaise > b2clLimit ? 'B2CL' : 'B2CS';
  const terms = (await one(client, 'SELECT terms_days FROM party.customer_profiles WHERE party_id = $1', [order.party_id]))?.terms_days || 0;
  const number = (await one(client, "SELECT core.next_number('invoice', $1, $2, $3, 4::smallint) AS n", [seller.gstin, fy, `CR/${fy}/`])).n;
  const sellerJson = {
    legal_name: seller.legal_name,
    brand_name: seller.brand_name,
    gstin: seller.gstin,
    state_code: seller.state_code,
    pan: seller.pan,
    cin: seller.cin,
    fssai: seller.fssai_licence,
    address: addressLine(seller.address_line1, seller.address_line2, seller.city, seller.pincode),
    phone: seller.phone,
    email: seller.email,
  };
  const invoice = await one(
    client,
    `INSERT INTO sales.invoices (number, gst_registration_id, fy, invoice_date, order_id, party_id, doc_type, supply_type, seller, buyer, ship_to,
       place_of_supply, interstate, includes_gst, taxable_paise, exempt_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise,
       amount_in_words, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $4::date + $23::int) RETURNING id`,
    [
      number, seller.registration_id, fy, date, orderId, order.party_id, docTypeOf(lines), supplyType, sellerJson, buyer, order.ship_to,
      order.place_of_supply, interstate, order.includes_gst, t.taxablePaise - exempt, exempt, t.cgstPaise, t.sgstPaise, t.igstPaise,
      t.roundOffPaise, t.totalPaise, amountInWords(t.totalPaise), terms,
    ],
  );
  for (const [index, l] of t.lines.entries()) {
    await client.query(
      `INSERT INTO sales.invoice_lines (invoice_id, line_no, order_line_id, item_id, description, hsn, qty, unit_price_paise, gst_rate_bp,
         taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [invoice.id, index + 1, l.id, l.item_id, l.description, l.hsn, l.qty, l.unit_price_paise, l.gst_rate_bp, l.taxablePaise, l.cgstPaise, l.sgstPaise, l.igstPaise, l.totalPaise],
    );
  }
  await event(client, orderId, 'invoiced', null, null, `${number}, ${rupees(t.totalPaise)}`);
  return invoice.id;
}

export async function cancelInvoice(client, invoiceId, body) {
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Give a reason for cancelling the invoice.', { reason: 'Give a reason.' });
  const inv = await one(client, 'SELECT i.*, o.status AS order_status FROM sales.invoices i JOIN sales.orders o ON o.id = i.order_id WHERE i.id = $1 FOR UPDATE OF i', [invoiceId]);
  if (!inv) throw notFound('Invoice');
  if (inv.status !== 'issued') throw new InputError('This invoice is already cancelled.');
  if (['dispatched', 'delivered', 'returned'].includes(inv.order_status)) {
    throw new InputError('The goods have left on this invoice. Record a return (with its credit note) instead of cancelling.');
  }
  const bal = await one(client, 'SELECT paid_paise, credited_paise FROM sales.invoice_balance WHERE invoice_id = $1', [invoiceId]);
  if (bal.paid_paise > 0) throw new InputError('Payments are matched to this invoice. Reverse those payments first.');
  if (bal.credited_paise > 0) throw new InputError('This invoice has a credit note.');
  await client.query("UPDATE sales.invoices SET status = 'cancelled', cancelled_at = now(), cancelled_by = core.actor(), cancel_reason = $2 WHERE id = $1", [invoiceId, reason]);
  await event(client, inv.order_id, 'invoice cancelled', null, null, `${inv.number}: ${reason}`);
}

// ---- Returns and credit notes ----
export async function recordReturn(client, orderId, body) {
  const order = await one(client, 'SELECT * FROM sales.orders WHERE id = $1 FOR UPDATE', [orderId]);
  if (!order) throw notFound('Order');
  if (!['dispatched', 'delivered'].includes(order.status)) throw new InputError('Only bags that were dispatched can be returned.');
  const invoice = await one(client, "SELECT * FROM sales.invoices WHERE order_id = $1 AND status = 'issued'", [orderId]);
  if (!invoice) throw new InputError('This order has no invoice to credit.');
  const date = cleanDate(body.date, 'date', await today(client));
  const wanted = (Array.isArray(body.lines) ? body.lines : []).filter((l) => Number(l.qty) > 0);
  if (!wanted.length) throw new InputError('Enter how many bags came back.', { lines: 'Enter the bags.' });
  const place = await one(client, "SELECT id AS location_id FROM org.locations WHERE branch_id = $1 AND kind = 'godown' AND active ORDER BY id LIMIT 1", [order.branch_id]);
  const ret = await one(client, 'INSERT INTO sales.returns (order_id, return_date, notes) VALUES ($1, $2, $3) RETURNING id', [orderId, date, orNull(text(body.notes, 500))]);
  const creditLines = [];
  for (const w of wanted) {
    const line = await one(
      client,
      `SELECT ol.*, il.id AS invoice_line_id, il.description, il.unit_price_paise AS invoiced_price, il.gst_rate_bp AS invoiced_rate, il.hsn AS invoiced_hsn,
              ol.qty - coalesce((SELECT sum(rl.qty) FROM sales.return_lines rl WHERE rl.order_line_id = ol.id), 0) AS returnable
       FROM sales.order_lines ol JOIN sales.invoice_lines il ON il.order_line_id = ol.id AND il.invoice_id = $3
       WHERE ol.id = $1 AND ol.order_id = $2`,
      [Number(w.orderLineId), orderId, invoice.id],
    );
    if (!line) throw notFound('Order line');
    const qty = qtyOf(w.qty);
    if (qty > line.returnable) throw new InputError(`Only ${line.returnable} bags of ${line.description} can still come back.`);
    const condition = w.condition === 'damaged' ? 'damaged' : 'good';
    await client.query('INSERT INTO sales.return_lines (return_id, order_line_id, item_id, qty, condition) VALUES ($1, $2, $3, $4, $5)', [ret.id, line.id, line.item_id, qty, condition]);
    await stockMove(client, {
      locationId: place.location_id,
      itemId: line.item_id,
      type: condition === 'damaged' ? 'return_damaged' : 'return',
      onHand: condition === 'good' ? qty : 0,
      damaged: condition === 'damaged' ? qty : 0,
      refType: 'return',
      refId: ret.id,
      refNumber: order.number,
      reason: text(body.notes, 200) || null,
    });
    creditLines.push({ id: line.invoice_line_id, item_id: line.item_id, description: line.description, hsn: line.invoiced_hsn, qty, unit_price_paise: line.invoiced_price, gst_rate_bp: line.invoiced_rate });
  }
  const t = taxLines(creditLines, { inclusive: invoice.includes_gst, interstate: invoice.interstate });
  const exempt = t.lines.filter((l) => l.gst_rate_bp === 0).reduce((s, l) => s + l.taxablePaise, 0);
  const fy = await fyOf(client, date);
  const reg = await one(client, 'SELECT gstin FROM org.gst_registrations WHERE id = $1', [invoice.gst_registration_id]);
  const number = (await one(client, "SELECT core.next_number('credit_note', $1, $2, $3, 4::smallint) AS n", [reg.gstin, fy, `CN/${fy}/`])).n;
  const note = await one(
    client,
    `INSERT INTO sales.credit_notes (number, gst_registration_id, fy, note_date, invoice_id, party_id, return_id, reason, seller, buyer, place_of_supply, interstate,
       taxable_paise, exempt_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise, amount_in_words)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'return', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id`,
    [number, invoice.gst_registration_id, fy, date, invoice.id, invoice.party_id, ret.id, invoice.seller, invoice.buyer, invoice.place_of_supply, invoice.interstate,
      t.taxablePaise - exempt, exempt, t.cgstPaise, t.sgstPaise, t.igstPaise, t.roundOffPaise, t.totalPaise, amountInWords(t.totalPaise)],
  );
  for (const [index, l] of t.lines.entries()) {
    await client.query(
      `INSERT INTO sales.credit_note_lines (credit_note_id, line_no, invoice_line_id, item_id, description, hsn, qty, unit_price_paise, gst_rate_bp,
         taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [note.id, index + 1, l.id, l.item_id, l.description, l.hsn, l.qty, l.unit_price_paise, l.gst_rate_bp, l.taxablePaise, l.cgstPaise, l.sgstPaise, l.igstPaise, l.totalPaise],
    );
  }
  const left = await one(
    client,
    `SELECT coalesce(sum(ol.qty), 0) - coalesce((SELECT sum(rl.qty) FROM sales.return_lines rl JOIN sales.order_lines x ON x.id = rl.order_line_id WHERE x.order_id = $1), 0) AS n
     FROM sales.order_lines ol WHERE ol.order_id = $1 AND ol.active`,
    [orderId],
  );
  if (Number(left.n) === 0) {
    await client.query("UPDATE sales.orders SET status = 'returned' WHERE id = $1", [orderId]);
    await event(client, orderId, 'all bags returned', order.status, 'returned', `${number}, ${rupees(t.totalPaise)}`);
  } else {
    await event(client, orderId, 'bags returned', null, null, `${creditLines.reduce((s, l) => s + l.qty, 0)} bags, credit note ${number}, ${rupees(t.totalPaise)}`);
  }
  return note.id;
}

// ---- Payments ----
async function allocate(client, receipt, allocations) {
  let left = (await one(client, 'SELECT unallocated_paise FROM sales.receipt_balance WHERE receipt_id = $1', [receipt.id])).unallocated_paise;
  const plan = [];
  if (Array.isArray(allocations) && allocations.length) {
    for (const a of allocations) {
      const amount = toPaise(a.amount, 'allocation');
      plan.push({ invoiceId: Number(a.invoiceId), amount });
    }
  } else {
    // Oldest unpaid invoice first.
    const open = await all(client, 'SELECT invoice_id, balance_paise FROM sales.invoice_balance WHERE party_id = $1 AND balance_paise > 0 ORDER BY invoice_date, invoice_id', [receipt.party_id]);
    for (const inv of open) {
      if (left <= 0) break;
      const amount = Math.min(left, inv.balance_paise);
      plan.push({ invoiceId: inv.invoice_id, amount });
      left -= amount;
    }
  }
  for (const p of plan) {
    const inv = await one(client, "SELECT id, number, party_id FROM sales.invoices WHERE id = $1 AND status = 'issued' FOR UPDATE", [p.invoiceId]);
    if (!inv || inv.party_id !== receipt.party_id) throw new InputError('That invoice is not this customer’s, or it is cancelled.');
    const bal = (await one(client, 'SELECT balance_paise FROM sales.invoice_balance WHERE invoice_id = $1', [inv.id])).balance_paise;
    if (p.amount > bal) throw new InputError(`Invoice ${inv.number} has only ${rupees(bal)} left to pay.`);
    await client.query('INSERT INTO sales.receipt_allocations (receipt_id, invoice_id, amount_paise) VALUES ($1, $2, $3)', [receipt.id, inv.id, p.amount]);
  }
}

export async function createReceipt(client, body) {
  const party = await one(client, 'SELECT id, is_customer FROM party.parties WHERE id = $1', [Number(body.partyId)]);
  if (!party?.is_customer) throw new InputError('Choose the customer who paid.', { partyId: 'Choose a customer.' });
  if (!RECEIPT_METHODS.includes(body.method)) throw new InputError('Choose how they paid.', { method: 'Choose one.' });
  const amount = toPaise(body.amount, 'amount');
  const date = cleanDate(body.date, 'date', await today(client));
  const reference = orNull(text(body.reference, 80));
  if (['upi', 'bank', 'cheque', 'razorpay'].includes(body.method) && !reference) {
    throw new InputError('Enter the reference (UTR, cheque number or transaction id), so the payment can be traced.', { reference: 'Enter the reference.' });
  }
  const fy = await fyOf(client, date);
  const number = (await one(client, "SELECT core.next_number('receipt', 'all', $1, $2, 4::smallint) AS n", [fy, `RC/${fy}/`])).n;
  const receipt = await one(
    client,
    'INSERT INTO sales.receipts (number, receipt_date, party_id, method, reference, amount_paise, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, party_id',
    [number, date, party.id, body.method, reference, amount, orNull(text(body.notes, 500))],
  );
  if (body.allocate !== false) await allocate(client, receipt, body.allocations);
  return receipt.id;
}

export async function allocateReceipt(client, receiptId, body) {
  const receipt = await one(client, "SELECT id, party_id FROM sales.receipts WHERE id = $1 AND status = 'active' FOR UPDATE", [receiptId]);
  if (!receipt) throw notFound('Receipt');
  await allocate(client, receipt, body.allocations);
}

export async function reverseReceipt(client, receiptId, body) {
  const reason = text(body.reason, 300);
  if (!reason) throw new InputError('Give a reason for reversing the payment.', { reason: 'Give a reason.' });
  const r = await one(client, 'SELECT status FROM sales.receipts WHERE id = $1 FOR UPDATE', [receiptId]);
  if (!r) throw notFound('Receipt');
  if (r.status !== 'active') throw new InputError('This payment is already reversed.');
  await client.query('UPDATE sales.receipt_allocations SET active = false WHERE receipt_id = $1 AND active', [receiptId]);
  await client.query("UPDATE sales.receipts SET status = 'reversed', reversed_at = now(), reversed_by = core.actor(), reverse_reason = $2 WHERE id = $1", [receiptId, reason]);
}

// ---- Reading ----
export async function listOrders(client, { status = '', q = '' } = {}) {
  const search = text(q, 60);
  return all(
    client,
    `SELECT o.id, o.number, o.status, o.order_date, o.source, o.subtotal_paise, o.created_at, p.display_name AS customer, p.phone,
            i.number AS invoice_number, i.total_paise AS invoice_total, ib.balance_paise
     FROM sales.orders o JOIN party.parties p ON p.id = o.party_id
     LEFT JOIN sales.invoices i ON i.order_id = o.id AND i.status = 'issued'
     LEFT JOIN sales.invoice_balance ib ON ib.invoice_id = i.id
     WHERE ($1 = '' OR ($1 = 'open' AND o.status IN ('new', 'confirmed', 'packing', 'packed')) OR o.status = $1)
       AND ($2 = '' OR o.number ILIKE '%' || $2 || '%' OR p.display_name ILIKE '%' || $2 || '%' OR i.number ILIKE '%' || $2 || '%'
            OR p.phone LIKE '%' || regexp_replace($2, '\\D', '', 'g') || '%' AND length(regexp_replace($2, '\\D', '', 'g')) >= 4)
     ORDER BY o.id DESC LIMIT 300`,
    [status, search],
  );
}

// The delivery board: orders packed and waiting to go, on the road, and
// delivered in the last 7 days, with the vehicle, driver and LR details.
export async function listDeliveries(client) {
  return all(
    client,
    `SELECT o.id, o.number, o.status, o.order_date, o.ship_to, p.display_name AS customer, p.phone,
            d.dispatched_on, d.vehicle_no, d.driver_name, d.driver_phone, d.transporter, d.lr_no, d.eway_bill_no,
            (SELECT sum(qty) FROM sales.order_lines WHERE order_id = o.id)::int AS bags,
            i.number AS invoice_number, coalesce(i.total_paise, o.subtotal_paise) AS total_paise, ib.balance_paise,
            (SELECT max(e.at) FROM sales.order_events e WHERE e.order_id = o.id AND e.to_status = 'delivered') AS delivered_at,
            (core.today_ist() - d.dispatched_on) AS days_on_road
     FROM sales.orders o JOIN party.parties p ON p.id = o.party_id
     LEFT JOIN sales.dispatches d ON d.order_id = o.id
     LEFT JOIN sales.invoices i ON i.order_id = o.id AND i.status = 'issued'
     LEFT JOIN sales.invoice_balance ib ON ib.invoice_id = i.id
     WHERE o.status IN ('packed', 'dispatched') OR (o.status = 'delivered' AND o.updated_at > now() - interval '7 days')
     ORDER BY CASE o.status WHEN 'packed' THEN 0 WHEN 'dispatched' THEN 1 ELSE 2 END, o.id
     LIMIT 300`,
  );
}

export async function getOrder(client, id) {
  const order = await one(
    client,
    `SELECT o.*, p.display_name AS customer, p.phone, p.gstin, cp.segment, pl.code AS price_list
     FROM sales.orders o JOIN party.parties p ON p.id = o.party_id
     LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id LEFT JOIN price.price_lists pl ON pl.id = cp.price_list_id
     WHERE o.id = $1`,
    [id],
  );
  if (!order) throw notFound('Order');
  const place = await one(client, "SELECT id FROM org.locations WHERE branch_id = $1 AND kind = 'godown' AND active ORDER BY id LIMIT 1", [order.branch_id]);
  const [lines, events, dispatch, invoices, returns, notes] = await Promise.all([
    all(
      client,
      `SELECT ol.*, i.name, i.sku_code, i.pack_label,
              coalesce((SELECT on_hand - reserved FROM inv.stock_balances b WHERE b.item_id = ol.item_id AND b.location_id = $2), 0) AS available,
              coalesce((SELECT sum(rl.qty) FROM sales.return_lines rl WHERE rl.order_line_id = ol.id), 0) AS returned
       FROM sales.order_lines ol JOIN catalog.items i ON i.id = ol.item_id WHERE ol.order_id = $1 AND ol.active ORDER BY ol.line_no`,
      [id, place?.id || 0],
    ),
    all(client, 'SELECT * FROM sales.order_events WHERE order_id = $1 ORDER BY id', [id]),
    one(client, 'SELECT * FROM sales.dispatches WHERE order_id = $1', [id]),
    all(client, 'SELECT i.id, i.number, i.invoice_date, i.status, i.total_paise, i.cancel_reason, ib.balance_paise FROM sales.invoices i LEFT JOIN sales.invoice_balance ib ON ib.invoice_id = i.id WHERE i.order_id = $1 ORDER BY i.id', [id]),
    all(client, 'SELECT r.*, (SELECT json_agg(rl) FROM sales.return_lines rl WHERE rl.return_id = r.id) AS lines FROM sales.returns r WHERE r.order_id = $1 ORDER BY r.id', [id]),
    all(client, 'SELECT c.id, c.number, c.note_date, c.total_paise, c.status FROM sales.credit_notes c JOIN sales.invoices i ON i.id = c.invoice_id WHERE i.order_id = $1 ORDER BY c.id', [id]),
  ]);
  return { ...order, lines, events, dispatch, invoices, returns, creditNotes: notes, next: NEXT_STEPS[order.status] || [], credit: await creditCheck(client, order.party_id, order.status === 'new' ? order.subtotal_paise : 0, { lock: false }) };
}

export async function listInvoices(client, { q = '', partyId = null } = {}) {
  const search = text(q, 60);
  return all(
    client,
    `SELECT i.id, i.number, i.invoice_date, i.due_date, i.status, i.doc_type, i.supply_type, i.total_paise, i.buyer->>'name' AS customer,
            o.number AS order_number, ib.balance_paise, ib.days_overdue
     FROM sales.invoices i JOIN sales.orders o ON o.id = i.order_id LEFT JOIN sales.invoice_balance ib ON ib.invoice_id = i.id
     WHERE ($1 = '' OR i.number ILIKE '%' || $1 || '%' OR i.buyer->>'name' ILIKE '%' || $1 || '%' OR o.number ILIKE '%' || $1 || '%')
       AND ($2::bigint IS NULL OR i.party_id = $2)
     ORDER BY i.id DESC LIMIT 300`,
    [search, partyId],
  );
}

export async function getInvoice(client, id) {
  const invoice = await one(client, 'SELECT i.*, o.number AS order_number FROM sales.invoices i JOIN sales.orders o ON o.id = i.order_id WHERE i.id = $1', [id]);
  if (!invoice) throw notFound('Invoice');
  const [lines, balance, payments, notes, dispatch] = await Promise.all([
    all(client, 'SELECT * FROM sales.invoice_lines WHERE invoice_id = $1 ORDER BY line_no', [id]),
    one(client, 'SELECT * FROM sales.invoice_balance WHERE invoice_id = $1', [id]),
    all(client, 'SELECT r.number, r.receipt_date, r.method, a.amount_paise FROM sales.receipt_allocations a JOIN sales.receipts r ON r.id = a.receipt_id WHERE a.invoice_id = $1 AND a.active AND r.status = \'active\' ORDER BY r.receipt_date', [id]),
    all(client, 'SELECT id, number, note_date, total_paise, status FROM sales.credit_notes WHERE invoice_id = $1 ORDER BY id', [id]),
    one(client, 'SELECT * FROM sales.dispatches WHERE order_id = $1', [invoice.order_id]),
  ]);
  return { ...invoice, lines, balance, payments, creditNotes: notes, dispatch };
}

export async function getCreditNote(client, id) {
  const note = await one(client, 'SELECT c.*, i.number AS invoice_number, i.invoice_date FROM sales.credit_notes c JOIN sales.invoices i ON i.id = c.invoice_id WHERE c.id = $1', [id]);
  if (!note) throw notFound('Credit note');
  return { ...note, lines: await all(client, 'SELECT * FROM sales.credit_note_lines WHERE credit_note_id = $1 ORDER BY line_no', [id]) };
}

export async function listReceipts(client, { partyId = null } = {}) {
  return all(
    client,
    `SELECT r.id, r.number, r.receipt_date, r.method, r.reference, r.amount_paise, r.status, r.reverse_reason, p.display_name AS customer,
            rb.allocated_paise, rb.unallocated_paise
     FROM sales.receipts r JOIN party.parties p ON p.id = r.party_id LEFT JOIN sales.receipt_balance rb ON rb.receipt_id = r.id
     WHERE ($1::bigint IS NULL OR r.party_id = $1) ORDER BY r.id DESC LIMIT 300`,
    [partyId],
  );
}

// Who owes what, oldest problems first.
export async function dues(client) {
  return all(
    client,
    `SELECT pb.*, p.display_name AS customer, p.phone, cp.credit_limit_paise, cp.terms_days, cp.credit_status, cp.segment
     FROM sales.party_balance pb JOIN party.parties p ON p.id = pb.party_id LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id
     WHERE p.is_customer AND (pb.invoiced_due_paise <> 0 OR pb.advance_paise <> 0 OR pb.open_orders_paise <> 0)
     ORDER BY pb.oldest_overdue_days DESC, pb.net_due_paise DESC`,
  );
}

export async function partyAccount(client, partyId) {
  const [balance, invoices, receipts] = await Promise.all([
    one(client, 'SELECT * FROM sales.party_balance WHERE party_id = $1', [partyId]),
    all(client, 'SELECT * FROM sales.invoice_balance WHERE party_id = $1 AND balance_paise <> 0 ORDER BY invoice_date, invoice_id', [partyId]),
    listReceipts(client, { partyId }),
  ]);
  return { balance, invoices, receipts, credit: await creditCheck(client, partyId, 0, { lock: false }) };
}

// ---- Numbering ----
export async function listSeries(client) {
  const fy = await fyOf(client, await today(client));
  const regs = await all(client, 'SELECT gstin FROM org.gst_registrations WHERE active ORDER BY id');
  const wanted = [
    ...regs.map((r) => ({ doc_type: 'invoice', scope: r.gstin, fy, prefix: `CR/${fy}/`, pad: 4 })),
    ...regs.map((r) => ({ doc_type: 'credit_note', scope: r.gstin, fy, prefix: `CN/${fy}/`, pad: 4 })),
    { doc_type: 'receipt', scope: 'all', fy, prefix: `RC/${fy}/`, pad: 4 },
    { doc_type: 'order', scope: 'all', fy: 'all', prefix: 'CO-', pad: 5 },
  ];
  const have = await all(client, 'SELECT * FROM core.doc_series');
  return wanted.map((w) => ({ ...w, next_no: 1, used: false, ...have.find((h) => h.doc_type === w.doc_type && h.scope === w.scope && h.fy === w.fy), fy_now: fy }));
}

// Where a series starts (for example, carrying on from the paper bill book).
// A series that has issued documents can only move forward.
export async function setSeries(client, body) {
  const prefix = text(body.prefix, 10);
  const nextNo = Number(body.nextNo);
  const pad = Number(body.pad) || 4;
  if (!['invoice', 'credit_note', 'receipt', 'order'].includes(body.docType)) throw new InputError('Choose the kind of document.');
  if (!prefix || /[^A-Za-z0-9/-]/.test(prefix)) throw new InputError('The prefix may use letters, numbers, / and -.', { prefix: 'Letters, numbers, / and -.' });
  if (!Number.isInteger(nextNo) || nextNo < 1 || nextNo > 99_999_999) throw new InputError('Enter the next number.', { nextNo: 'A whole number.' });
  if (['invoice', 'credit_note'].includes(body.docType) && (prefix + String(nextNo).padStart(pad, '0')).length > 16) {
    throw new InputError('GST allows at most 16 characters in an invoice number. Shorten the prefix.', { prefix: 'Too long.' });
  }
  const row = await one(client, 'SELECT * FROM core.doc_series WHERE doc_type = $1 AND scope = $2 AND fy = $3 FOR UPDATE', [body.docType, body.scope, body.fy]);
  if (row && row.next_no > 1 && nextNo < row.next_no) throw new InputError(`Numbers up to ${row.next_no - 1} are already used. The next number can only go up.`, { nextNo: `At least ${row.next_no}.` });
  if (row && row.next_no > 1 && prefix !== row.prefix) throw new InputError('This series has already been used, so its prefix cannot change this year.', { prefix: 'Already in use.' });
  await client.query(
    `INSERT INTO core.doc_series (doc_type, scope, fy, prefix, next_no, pad) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (doc_type, scope, fy) DO UPDATE SET prefix = EXCLUDED.prefix, next_no = EXCLUDED.next_no, pad = EXCLUDED.pad`,
    [body.docType, body.scope, body.fy, prefix, nextNo, pad],
  );
}
