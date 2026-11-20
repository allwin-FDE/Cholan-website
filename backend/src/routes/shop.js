// The website's own buying, on the business database (Phase 4):
//
//   GET  /api/shop/catalog     packs, website prices, in stock or not (cached 5 min)
//   POST /api/shop/checkout    makes the order and the Razorpay order to pay
//   POST /api/shop/order       an order paid on delivery or at pickup (New, for staff to confirm)
//   POST /api/shop/verify      the browser's signed answer from Razorpay Checkout
//   POST /api/razorpay/webhook Razorpay's notifications (signed; each once)
//   POST /api/jobs/expire-unpaid      run by Cloud Scheduler (ADMIN_TOKEN)
//   POST /api/jobs/razorpay-reconcile nightly, by Cloud Scheduler (ADMIN_TOKEN)
//
// Nothing here takes orders until online payment is switched on in
// /admin → Business → Online payments (pay.online_enabled) with keys set.
import { Router } from 'express';
import express from 'express';
import { dbEnabled, withTx } from '../db/pool.js';
import { getOrder } from '../lib/sales.js';
import { orderEvent } from '../lib/whatsapp/events.js';
import { friendly } from '../lib/business.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { requireAdmin } from '../lib/requireAdmin.js';
import { catalog, checkout, placeOrder, expireUnpaid, handleWebhook, onlineStatus, razorpayApi, razorpayKeys, reconcile, verifyCheckout, webhookSignatureOk } from '../lib/online.js';

export const shop = Router();
export const razorpayWebhook = Router();
export const jobs = Router();

const checkoutLimit = createRateLimit({ windowMs: 10 * 60_000, max: 10, message: 'Too many tries. Please wait a few minutes, or WhatsApp us.' });
const offline = (res) => res.status(503).json({ error: 'Online ordering isn’t available right now. Please order on WhatsApp or call us.', code: 'online-off' });

const answer = async (res, next, fn) => {
  try {
    res.json(await fn());
  } catch (error) {
    const e = friendly(error);
    if (e.status && (e.status < 500 || e.code === 'online-off')) return res.status(e.status).json({ error: e.message, fields: e.fields || undefined, code: e.code || undefined });
    return next(e);
  }
};

let catalogCache = { at: 0, data: null };
shop.get('/catalog', (req, res, next) => {
  if (!dbEnabled()) return res.json({ online: false, items: [] });
  res.set('Cache-Control', 'public, max-age=120');
  return answer(res, next, async () => {
    if (catalogCache.data && Date.now() - catalogCache.at < 5 * 60_000) return catalogCache.data;
    const data = await withTx('website', async (c) => ({ online: (await onlineStatus(c)).enabled, items: (await catalog(c)).map((i) => ({ ...i, available: i.available > 0 })) }));
    catalogCache = { at: Date.now(), data };
    return data;
  });
});

shop.post('/checkout', checkoutLimit, (req, res, next) => {
  if (!dbEnabled()) return offline(res);
  return answer(res, next, () => withTx('website', (c) => checkout(c, req.body || {}, { rp: razorpayApi() })));
});

shop.post('/order', checkoutLimit, (req, res, next) => {
  if (!dbEnabled()) return offline(res);
  return answer(res, next, async () => {
    const placed = await withTx('website', (c) => placeOrder(c, req.body || {}));
    await websiteOrderEvent(placed.orderId);
    return placed;
  });
});

shop.post('/verify', (req, res, next) => {
  if (!dbEnabled()) return offline(res);
  return answer(res, next, async () => {
    const done = await withTx('website', (c) => verifyCheckout(c, req.body || {}));
    if (done.result === 'confirmed') await websiteOrderEvent(null, done.orderNumber);
    return done;
  });
});

// The customer's WhatsApp message for a new website order, if one is set up
// in /whatsapp → Automations. Never fails the order.
async function websiteOrderEvent(orderId, orderNumber) {
  try {
    const order = await withTx('website', async (c) => {
      const id = orderId || (await c.query('SELECT id FROM sales.orders WHERE number = $1', [orderNumber])).rows[0]?.id;
      return id ? getOrder(c, Number(id)) : null;
    });
    if (order) await orderEvent('website_order', order);
  } catch (error) {
    console.error('[whatsapp] website order message:', error.message);
  }
}

// Razorpay signs the exact bytes it sends, so the body is read raw.
razorpayWebhook.post('/', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!webhookSignatureOk(raw, req.get('x-razorpay-signature'), razorpayKeys().webhookSecret)) return res.status(400).json({ error: 'Bad signature.' });
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Not JSON.' });
  }
  const eventId = req.get('x-razorpay-event-id') || `${payload.event}:${payload.payload?.payment?.entity?.id || payload.created_at}`;
  try {
    const result = await withTx('razorpay', (c) => handleWebhook(c, { eventId, payload }));
    // Paid with the browser closed: the order's WhatsApp message goes from here.
    const number = payload.payload?.payment?.entity?.notes?.order_number;
    if (result === 'confirmed' && number) await websiteOrderEvent(null, number);
    return res.json({ ok: true, result });
  } catch (error) {
    // Razorpay retries for 24 hours when this is not a 2xx, so a short outage loses nothing.
    console.error('[razorpay] webhook failed:', error.message);
    return res.status(500).json({ error: 'Try again.' });
  }
});

jobs.post('/expire-unpaid', requireAdmin, async (req, res, next) => {
  if (!dbEnabled()) return res.json({ expired: [] });
  try {
    res.json({ expired: await withTx('scheduler', (c) => expireUnpaid(c)) });
  } catch (error) {
    next(error);
  }
});

// Yesterday and today's captured payments, from Razorpay, recorded if missed.
jobs.post('/razorpay-reconcile', requireAdmin, async (req, res, next) => {
  if (!dbEnabled() || !razorpayKeys().ready) return res.json({ recorded: [] });
  try {
    const rp = razorpayApi();
    const to = Math.floor(Date.now() / 1000);
    const from = to - 2 * 86_400;
    const payments = [];
    for (let skip = 0; skip < 1000; skip += 100) {
      const page = await rp.payments({ from, to, skip });
      payments.push(...(page.items || []));
      if ((page.items || []).length < 100) break;
    }
    res.json({ checked: payments.length, recorded: await withTx('razorpay-reconcile', (c) => reconcile(c, payments)) });
  } catch (error) {
    next(error);
  }
});
