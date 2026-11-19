// Phase 4: website orders paid online with Razorpay Standard Checkout.
//
// 1. Checkout makes the order (prices from the website price list), holds its
//    bags and puts it "awaiting payment", then makes a Razorpay order for the
//    exact amount.
// 2. The customer pays in Razorpay's window. The payment is recorded when the
//    browser comes back with Razorpay's signed answer, or when Razorpay's
//    notification (webhook) arrives, or by the nightly check, whichever is
//    first; it is recorded once, by Razorpay's payment id. The order then
//    confirms itself and the money is a receipt (method razorpay).
// 3. An order not paid in time (pay.unpaid_expiry_minutes) is cancelled and
//    its bags released by a scheduled job.
//
// Everything is off until core.settings pay.online_enabled is true and the
// Razorpay keys are set. Talking to Razorpay goes through `rp` (below), so
// tests can stand in for it.
import crypto from 'node:crypto';
import { InputError, cleanPhone, getParty, saveAddress, saveParty } from './business.js';
import { createOrder, createReceipt, mainPlace, moveOrder, previewOrder, reverseReceipt } from './sales.js';

const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const one = async (client, sql, values) => (await client.query(sql, values)).rows[0];
const all = async (client, sql, values) => (await client.query(sql, values)).rows;
const notFound = (what) => Object.assign(new Error(`${what} not found.`), { status: 404 });
const rupeesText = (paise) => (paise / 100).toFixed(2);

export function razorpayKeys(env = process.env) {
  const keyId = env.RAZORPAY_KEY_ID || '';
  const keySecret = env.RAZORPAY_KEY_SECRET || '';
  return { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '', ready: Boolean(keyId && keySecret), live: keyId.startsWith('rzp_live_') };
}

// The Razorpay API (https://razorpay.com/docs/api/), with the server's keys.
export function razorpayApi(keys = razorpayKeys()) {
  const auth = `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`;
  const call = async (method, path, body) => {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(`Razorpay: ${data.error?.description || response.status}`), { status: 502 });
    return data;
  };
  return {
    createOrder: (body) => call('POST', '/orders', body),
    payments: ({ from, to, skip = 0 }) => call('GET', `/payments?from=${from}&to=${to}&count=100&skip=${skip}`),
    refund: (paymentId, body) => call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, body),
  };
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
// The signature Checkout returns: HMAC of "order_id|payment_id" with the key secret.
export const checkoutSignatureOk = (rpOrderId, rpPaymentId, signature, keySecret) =>
  Boolean(keySecret) && safeEqual(hmac(keySecret, `${rpOrderId}|${rpPaymentId}`), signature);
// A webhook's signature: HMAC of the raw body with the webhook secret.
export const webhookSignatureOk = (rawBody, signature, webhookSecret) => Boolean(webhookSecret) && safeEqual(hmac(webhookSecret, rawBody), signature);

async function setting(client, key, fallback) {
  const row = await one(client, 'SELECT value FROM core.settings WHERE key = $1', [key]);
  return row ? row.value : fallback;
}

export async function onlineStatus(client, keys = razorpayKeys()) {
  const enabled = (await setting(client, 'pay.online_enabled', false)) === true;
  return { enabled: enabled && keys.ready, switchedOn: enabled, keysSet: keys.ready, liveKeys: keys.live, expiryMinutes: Number(await setting(client, 'pay.unpaid_expiry_minutes', 30)) };
}

export async function setOnline(client, on) {
  await client.query("UPDATE core.settings SET value = $1::jsonb WHERE key = 'pay.online_enabled'", [JSON.stringify(Boolean(on))]);
}

// What the website can sell: each pack, its website price and whether bags
// are free in the main godown. Cached by the route for a few minutes.
export async function catalog(client) {
  const place = await mainPlace(client);
  return all(
    client,
    `SELECT i.id AS item_id, p.slug, p.name AS product_name, i.pack_label, i.net_weight_g, i.gst_rate_bp,
            (SELECT li.price_paise FROM price.list_items li JOIN price.price_lists pl ON pl.id = li.price_list_id AND pl.is_default AND pl.active
              WHERE li.item_id = i.id AND li.min_qty = 1 AND core.today_ist() BETWEEN li.valid_from AND coalesce(li.valid_to, 'infinity'::date)
              ORDER BY li.valid_from DESC LIMIT 1) AS price_paise,
            coalesce((SELECT b.on_hand - b.reserved FROM inv.stock_balances b WHERE b.item_id = i.id AND b.location_id = $1), 0) AS available
     FROM catalog.items i JOIN catalog.products p ON p.id = i.product_id
     WHERE i.kind = 'finished' AND i.active AND p.active ORDER BY p.name, i.net_weight_g`,
    [place.location_id],
  );
}

// The customer, found by mobile number or made new, with this address.
async function customerFor(client, body) {
  const name = text(body.name, 80);
  const phone = cleanPhone(body.phone);
  const a = body.address || {};
  const fields = {};
  if (name.length < 2) fields.name = 'Enter your name.';
  if (!phone) fields.phone = 'Enter your mobile number.';
  if (!text(a.line1, 160)) fields.line1 = 'Enter the delivery address.';
  if (!text(a.city, 60)) fields.city = 'Enter the town or city.';
  if (!/^[1-9][0-9]{5}$/.test(text(String(a.pincode ?? ''), 6))) fields.pincode = 'Enter the 6-digit PIN code.';
  if (!/^[0-9]{2}$/.test(String(a.stateCode ?? ''))) fields.stateCode = 'Choose the state.';
  if (Object.keys(fields).length) throw new InputError('Please check the highlighted details.', fields);
  const email = text(body.email, 120).toLowerCase();
  const address = { kind: 'shipping', line1: a.line1, line2: a.line2, city: a.city, stateCode: String(a.stateCode), pincode: String(a.pincode) };
  const found = await one(client, "SELECT id FROM party.parties WHERE phone = $1 AND kind = 'person' AND is_customer AND active", [phone]);
  if (!found) {
    const party = await saveParty(client, null, { kind: 'person', displayName: name, phone, email: email || undefined, isCustomer: true, customer: { segment: 'b2c' }, address: { ...address, kind: 'both' } });
    return { partyId: party.id, addressId: party.addresses?.[0]?.id || null };
  }
  const same = await one(
    client,
    'SELECT id FROM party.addresses WHERE party_id = $1 AND active AND lower(line1) = lower($2) AND pincode = $3 ORDER BY id LIMIT 1',
    [found.id, text(a.line1, 160), String(a.pincode)],
  );
  if (same) return { partyId: found.id, addressId: same.id };
  await saveAddress(client, found.id, null, address);
  const party = await getParty(client, found.id);
  return { partyId: found.id, addressId: party.addresses.at(-1)?.id || null };
}

// Makes the website order, holds its bags and asks Razorpay for an order.
export async function checkout(client, body, { rp, keys = razorpayKeys() }) {
  if (!(await onlineStatus(client, keys)).enabled) {
    throw Object.assign(new InputError('Online payment isn’t available right now. Please order on WhatsApp or call us.'), { status: 503, code: 'online-off' });
  }
  const lines = (Array.isArray(body.lines) ? body.lines : []).filter((l) => l && l.itemId).slice(0, 30);
  if (!lines.length) throw new InputError('Your cart is empty.');
  const { partyId, addressId } = await customerFor(client, body);
  const order = { partyId, addressId, lines: lines.map((l) => ({ itemId: Number(l.itemId), qty: l.qty })), source: 'website', notes: text(body.notes, 500) };
  const preview = await previewOrder(client, order, { canSetPrice: false });
  for (const l of preview.lines) {
    if (l.available < l.qty) throw new InputError(`Sorry, only ${l.available} of ${l.name} ${l.available === 1 ? 'is' : 'are'} in stock right now.`);
  }
  const orderId = await createOrder(client, order, { canSetPrice: false });
  const o = await one(client, 'SELECT number, branch_id FROM sales.orders WHERE id = $1', [orderId]);
  const place = await mainPlace(client, o.branch_id);
  for (const l of preview.lines) {
    await client.query(
      "INSERT INTO inv.stock_moves (location_id, item_id, type, reserved_change, ref_type, ref_id, ref_number, reason) VALUES ($1, $2, 'reserve', $3, 'order', $4, $5, 'Held for online payment')",
      [place.location_id, l.itemId, l.qty, orderId, o.number],
    );
  }
  await client.query("UPDATE sales.orders SET status = 'awaiting_payment' WHERE id = $1", [orderId]);
  await client.query("INSERT INTO sales.order_events (order_id, action, from_status, to_status, detail) VALUES ($1, 'waiting for online payment', 'new', 'awaiting_payment', $2)", [
    orderId,
    `₹${rupeesText(preview.totalPaise)} to pay`,
  ]);
  const rpOrder = await rp.createOrder({ amount: preview.totalPaise, currency: 'INR', receipt: o.number, notes: { order_id: String(orderId), order_number: o.number } });
  await client.query('INSERT INTO pay.razorpay_orders (order_id, rp_order_id, amount_paise) VALUES ($1, $2, $3)', [orderId, rpOrder.id, preview.totalPaise]);
  return { orderId, orderNumber: o.number, amountPaise: preview.totalPaise, razorpay: { keyId: keys.keyId, orderId: rpOrder.id, amount: preview.totalPaise, currency: 'INR' } };
}

// Records one Razorpay payment, once. Returns what happened.
export async function recordPayment(client, p) {
  const rpo = await one(client, 'SELECT * FROM pay.razorpay_orders WHERE rp_order_id = $1 FOR UPDATE', [p.rpOrderId]);
  const inserted = await one(
    client,
    `INSERT INTO pay.razorpay_payments (rp_payment_id, rp_order_id, order_id, amount_paise, status, method, via, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (rp_payment_id) DO NOTHING RETURNING rp_payment_id`,
    [p.rpPaymentId, p.rpOrderId, rpo?.order_id || null, p.amountPaise, p.status || 'captured', p.method || null, p.via, p.payload || null],
  );
  if (!inserted) return 'already recorded';
  if (!rpo) return 'not one of our orders';
  if (!['captured', 'authorized'].includes(p.status || 'captured')) return `payment ${p.status}`;
  const order = await one(client, 'SELECT id, number, status, party_id FROM sales.orders WHERE id = $1 FOR UPDATE', [rpo.order_id]);
  const receiptId = await createReceipt(client, {
    partyId: order.party_id,
    method: 'razorpay',
    reference: p.rpPaymentId,
    amount: rupeesText(p.amountPaise),
    allocate: false,
    notes: `Online payment for order ${order.number}`,
  });
  await client.query('UPDATE pay.razorpay_payments SET receipt_id = $2 WHERE rp_payment_id = $1', [p.rpPaymentId, receiptId]);
  if (order.status === 'awaiting_payment') {
    await client.query("UPDATE pay.razorpay_orders SET status = 'paid', receipt_id = $2, paid_at = now() WHERE id = $1", [rpo.id, receiptId]);
    await client.query("UPDATE sales.orders SET status = 'confirmed' WHERE id = $1", [order.id]);
    const short = p.amountPaise !== rpo.amount_paise ? ` (paid ₹${rupeesText(p.amountPaise)}, expected ₹${rupeesText(rpo.amount_paise)}: check)` : '';
    await client.query("INSERT INTO sales.order_events (order_id, action, from_status, to_status, detail) VALUES ($1, 'paid online', 'awaiting_payment', 'confirmed', $2)", [
      order.id,
      `Razorpay ${p.rpPaymentId}${short}`,
    ]);
    return 'confirmed';
  }
  // Paid after the order had already expired: keep the money as an advance and
  // flag it for a person to re-make the order or refund.
  await client.query("UPDATE pay.razorpay_orders SET status = 'paid_late', receipt_id = $2, paid_at = now() WHERE id = $1", [rpo.id, receiptId]);
  await client.query("INSERT INTO sales.order_events (order_id, action, from_status, to_status, detail) VALUES ($1, 'paid after the order expired', $2, $2, $3)", [
    order.id,
    order.status,
    `Razorpay ${p.rpPaymentId}: refund it, or take the order again`,
  ]);
  return 'paid late';
}

// The browser's answer from Checkout, checked against the key secret.
export async function verifyCheckout(client, body, { keys = razorpayKeys() } = {}) {
  const rpOrderId = text(body.razorpay_order_id, 60);
  const rpPaymentId = text(body.razorpay_payment_id, 60);
  if (!checkoutSignatureOk(rpOrderId, rpPaymentId, body.razorpay_signature, keys.keySecret)) {
    throw Object.assign(new InputError('We could not confirm this payment. If money was taken, it will be matched automatically; or WhatsApp us.'), { status: 400 });
  }
  const rpo = await one(client, 'SELECT r.amount_paise, o.number FROM pay.razorpay_orders r JOIN sales.orders o ON o.id = r.order_id WHERE r.rp_order_id = $1', [rpOrderId]);
  if (!rpo) throw notFound('Order');
  const result = await recordPayment(client, { rpPaymentId, rpOrderId, amountPaise: rpo.amount_paise, status: 'captured', via: 'checkout' });
  return { orderNumber: rpo.number, result };
}

// A Razorpay notification, already checked by its signature. Each event once.
export async function handleWebhook(client, { eventId, payload }) {
  const event = String(payload?.event || '');
  const fresh = await one(client, 'INSERT INTO pay.webhook_events (event_id, event, payload) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_id', [eventId, event, payload]);
  if (!fresh) return 'duplicate';
  let result = 'ignored';
  const payment = payload?.payload?.payment?.entity;
  if (['payment.captured', 'order.paid'].includes(event) && payment?.order_id) {
    result = await recordPayment(client, { rpPaymentId: payment.id, rpOrderId: payment.order_id, amountPaise: payment.amount, status: 'captured', method: payment.method, via: 'webhook', payload: payment });
  } else if (event === 'payment.failed') {
    result = `failed: ${payment?.error_description || 'no reason given'}`;
  } else if (event.startsWith('refund.') && payload?.payload?.refund?.entity) {
    const r = payload.payload.refund.entity;
    await client.query(
      `INSERT INTO pay.refunds (rp_refund_id, rp_payment_id, amount_paise, status, payload) SELECT $1, $2, $3, $4, $5
       WHERE EXISTS (SELECT 1 FROM pay.razorpay_payments WHERE rp_payment_id = $2)
       ON CONFLICT (rp_refund_id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload`,
      [r.id, r.payment_id, r.amount, r.status, r],
    );
    result = `refund ${r.status}`;
  }
  await client.query('UPDATE pay.webhook_events SET result = $2 WHERE event_id = $1', [eventId, result]);
  return result;
}

// Website orders not paid in time: cancelled, bags released.
export async function expireUnpaid(client) {
  const minutes = Number(await setting(client, 'pay.unpaid_expiry_minutes', 30)) || 30;
  const stale = await all(
    client,
    `SELECT o.id, o.number, o.branch_id FROM sales.orders o JOIN pay.razorpay_orders r ON r.order_id = o.id
     WHERE o.status = 'awaiting_payment' AND r.status = 'created' AND o.created_at < now() - make_interval(mins => $1) FOR UPDATE OF o`,
    [minutes],
  );
  for (const o of stale) {
    const place = await mainPlace(client, o.branch_id);
    const lines = await all(client, 'SELECT item_id, sum(qty)::int AS qty FROM sales.order_lines WHERE order_id = $1 AND active GROUP BY item_id', [o.id]);
    for (const l of lines) {
      await client.query(
        "INSERT INTO inv.stock_moves (location_id, item_id, type, reserved_change, ref_type, ref_id, ref_number, reason) VALUES ($1, $2, 'release', $3, 'order', $4, $5, 'Not paid in time')",
        [place.location_id, l.item_id, -l.qty, o.id, o.number],
      );
    }
    await client.query("UPDATE sales.orders SET status = 'cancelled', cancel_reason = $2 WHERE id = $1", [o.id, `Not paid within ${minutes} minutes`]);
    await client.query("UPDATE pay.razorpay_orders SET status = 'expired' WHERE order_id = $1", [o.id]);
    await client.query("INSERT INTO sales.order_events (order_id, action, from_status, to_status, detail) VALUES ($1, 'expired', 'awaiting_payment', 'cancelled', $2)", [o.id, `Not paid within ${minutes} minutes`]);
  }
  return stale.map((o) => o.number);
}

// The nightly check: any captured payment Razorpay has that we missed.
export async function reconcile(client, payments) {
  const results = [];
  for (const p of payments) {
    if (p.status !== 'captured' || !p.order_id) continue;
    const r = await recordPayment(client, { rpPaymentId: p.id, rpOrderId: p.order_id, amountPaise: p.amount, status: 'captured', method: p.method, via: 'reconcile', payload: p });
    if (r !== 'already recorded' && r !== 'not one of our orders') results.push({ payment: p.id, result: r });
  }
  return results;
}

// Gives the whole payment back and cancels the order (before dispatch only).
export async function refundOrder(client, orderId, body, { rp }) {
  const reason = text(body.reason, 200);
  if (!reason) throw new InputError('Give a reason for the refund.', { reason: 'Give a reason.' });
  const rpo = await one(client, "SELECT * FROM pay.razorpay_orders WHERE order_id = $1 AND status IN ('paid', 'paid_late') FOR UPDATE", [orderId]);
  if (!rpo) throw new InputError('This order has no online payment to refund.');
  const payment = await one(client, "SELECT * FROM pay.razorpay_payments WHERE rp_order_id = $1 AND status = 'captured' ORDER BY created_at LIMIT 1", [rpo.rp_order_id]);
  const order = await one(client, 'SELECT status FROM sales.orders WHERE id = $1', [orderId]);
  if (['dispatched', 'delivered', 'returned'].includes(order.status)) throw new InputError('This order has been dispatched. Record the returned bags first; refund from the Razorpay dashboard.');
  const refund = await rp.refund(payment.rp_payment_id, { amount: payment.amount_paise, notes: { reason } });
  await client.query('INSERT INTO pay.refunds (rp_refund_id, rp_payment_id, order_id, amount_paise, status, reason, payload) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING', [
    refund.id,
    payment.rp_payment_id,
    orderId,
    payment.amount_paise,
    refund.status || 'pending',
    reason,
    refund,
  ]);
  if (rpo.receipt_id) await reverseReceipt(client, rpo.receipt_id, { reason: `Refunded online: ${reason}` });
  await client.query("UPDATE pay.razorpay_orders SET status = 'refunded' WHERE id = $1", [rpo.id]);
  if (['confirmed', 'packing', 'packed'].includes(order.status)) await moveOrder(client, orderId, 'cancelled', { reason: `Refunded: ${reason}` }, { isAdmin: true });
  return refund.id;
}

export async function onlineOrders(client) {
  return all(
    client,
    `SELECT r.rp_order_id, r.amount_paise, r.status AS pay_status, r.paid_at, r.created_at, o.id AS order_id, o.number, o.status, p.display_name AS customer, p.phone,
            (SELECT rp_payment_id FROM pay.razorpay_payments WHERE rp_order_id = r.rp_order_id ORDER BY created_at LIMIT 1) AS rp_payment_id
     FROM pay.razorpay_orders r JOIN sales.orders o ON o.id = r.order_id JOIN party.parties p ON p.id = o.party_id
     ORDER BY r.id DESC LIMIT 200`,
  );
}
