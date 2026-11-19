// npm run test:db — Phase 4, online payments, on a fresh throwaway database.
// Razorpay itself is replaced by a stand-in (no network, no real keys): the
// signatures are made with test secrets exactly as Razorpay makes them.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../scripts/seed-reference.js';
import '../src/db/pool.js';
import { friendly } from '../src/lib/business.js';
import { adjustStock, getOrder, moveOrder } from '../src/lib/sales.js';
import { checkout, placeOrder, checkoutSignatureOk, expireUnpaid, handleWebhook, onlineStatus, reconcile, refundOrder, setOnline, verifyCheckout, webhookSignatureOk } from '../src/lib/online.js';

const ADMIN = process.env.DEV_DB_ADMIN_URL;
const name = `cholan_online_${process.pid}`;
const urlFor = (url, database) => Object.assign(new URL(url), { pathname: `/${database}` }).href;
const keys = { keyId: 'rzp_test_STANDIN', keySecret: 'test-key-secret', webhookSecret: 'test-webhook-secret', ready: true, live: false };
const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

describe('online payments', { skip: !ADMIN && 'DEV_DB_ADMIN_URL is not set' }, () => {
  let admin;
  let owner;
  let app;
  const sku = {};
  let n = 0;
  const refunds = [];
  // The stand-in for Razorpay's API.
  const rp = {
    createOrder: async (body) => ({ id: `order_TEST${(n += 1)}`, amount: body.amount, currency: body.currency }),
    refund: async (paymentId, body) => {
      refunds.push({ paymentId, ...body });
      return { id: `rfnd_TEST${refunds.length}`, status: 'processed' };
    },
  };

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
  const site = (fn) => as('website', fn);
  const boss = (fn) => as('owner@cholanrice.in', fn);
  const stockOf = async (code) =>
    (await app.query('SELECT on_hand, reserved FROM inv.stock_balances b JOIN catalog.items i ON i.id = b.item_id WHERE i.sku_code = $1', [code])).rows[0];
  const buyer = (extra = {}) => ({
    name: 'Lakshmi',
    phone: '98765 43210',
    email: 'lakshmi@example.com',
    address: { line1: '4 Gandhi Street', city: 'Coimbatore', stateCode: '33', pincode: '641002' },
    lines: [{ itemId: sku['CPR-5KG'], qty: 2 }],
    ...extra,
  });
  const webhook = (eventId, payment, event = 'payment.captured') => site((c) => handleWebhook(c, { eventId, payload: { event, payload: { payment: { entity: payment } } } }));

  before(async () => {
    admin = new pg.Pool({ connectionString: ADMIN, max: 1 });
    await admin.query(`CREATE DATABASE ${name} OWNER cholan_owner`);
    await admin.query(`REVOKE ALL ON DATABASE ${name} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${name} TO cholan_owner, cholan_app, cholan_read`);
    owner = new pg.Pool({ connectionString: urlFor(process.env.MIGRATE_DATABASE_URL, name), max: 2 });
    app = new pg.Pool({ connectionString: urlFor(process.env.DATABASE_URL, name), max: 10 });
    await migrate(owner, { log: () => {} });
    await seed(owner, { log: () => {} });
    for (const r of (await app.query('SELECT id, sku_code FROM catalog.items')).rows) sku[r.sku_code] = r.id;
    await boss((c) => adjustStock(c, { itemId: sku['CPR-5KG'], kind: 'opening', qty: 10 }));
  });

  after(async () => {
    await owner?.end();
    await app?.end();
    await admin?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin?.end();
  });

  test('signatures are checked exactly as Razorpay makes them', () => {
    assert.equal(checkoutSignatureOk('order_1', 'pay_1', sign(keys.keySecret, 'order_1|pay_1'), keys.keySecret), true);
    assert.equal(checkoutSignatureOk('order_1', 'pay_2', sign(keys.keySecret, 'order_1|pay_1'), keys.keySecret), false);
    assert.equal(checkoutSignatureOk('order_1', 'pay_1', 'x', ''), false);
    const body = '{"event":"payment.captured"}';
    assert.equal(webhookSignatureOk(body, sign(keys.webhookSecret, body), keys.webhookSecret), true);
    assert.equal(webhookSignatureOk(`${body} `, sign(keys.webhookSecret, body), keys.webhookSecret), false);
  });

  test('online payment is off until switched on, and needs keys', async () => {
    await assert.rejects(site((c) => checkout(c, buyer(), { rp, keys })), /isn’t available/);
    await boss((c) => setOnline(c, true));
    assert.equal((await site((c) => onlineStatus(c, { ...keys, ready: false }))).enabled, false);
    assert.equal((await site((c) => onlineStatus(c, keys))).enabled, true);
  });

  test('checkout holds the bags and waits; the signed answer confirms the order and records the money', async () => {
    const r = await site((c) => checkout(c, buyer(), { rp, keys }));
    assert.equal(r.razorpay.keyId, keys.keyId);
    assert.equal(r.amountPaise, 2 * 52000);
    let o = await site((c) => getOrder(c, r.orderId));
    assert.equal(o.status, 'awaiting_payment');
    assert.equal(o.source, 'website');
    assert.deepEqual(await stockOf('CPR-5KG'), { on_hand: 10, reserved: 2 });

    await assert.rejects(site((c) => verifyCheckout(c, { razorpay_order_id: r.razorpay.orderId, razorpay_payment_id: 'pay_A', razorpay_signature: 'forged' }, { keys })), /could not confirm/);
    const v = await site((c) =>
      verifyCheckout(c, { razorpay_order_id: r.razorpay.orderId, razorpay_payment_id: 'pay_A', razorpay_signature: sign(keys.keySecret, `${r.razorpay.orderId}|pay_A`) }, { keys }),
    );
    assert.equal(v.result, 'confirmed');
    o = await site((c) => getOrder(c, r.orderId));
    assert.equal(o.status, 'confirmed');
    const receipts = (await app.query("SELECT method, reference, amount_paise FROM sales.receipts WHERE reference = 'pay_A'")).rows;
    assert.deepEqual(receipts, [{ method: 'razorpay', reference: 'pay_A', amount_paise: 104000 }]);
    // The same customer next time is found by their mobile number, not made twice.
    assert.equal((await app.query("SELECT count(*)::int AS n FROM party.parties WHERE phone = '+919876543210'")).rows[0].n, 1);
  });

  test('a notification received three times (and the browser answer too) records one payment', async () => {
    const r = await site((c) => checkout(c, buyer(), { rp, keys }));
    const payment = { id: 'pay_B', order_id: r.razorpay.orderId, amount: r.amountPaise, method: 'upi' };
    assert.equal(await webhook('evt_1', payment), 'confirmed');
    assert.equal(await webhook('evt_1', payment), 'duplicate');
    assert.equal(await webhook('evt_1', payment), 'duplicate');
    assert.equal(await webhook('evt_2', payment, 'order.paid'), 'already recorded');
    const v = await site((c) =>
      verifyCheckout(c, { razorpay_order_id: r.razorpay.orderId, razorpay_payment_id: 'pay_B', razorpay_signature: sign(keys.keySecret, `${r.razorpay.orderId}|pay_B`) }, { keys }),
    );
    assert.equal(v.result, 'already recorded');
    assert.equal((await app.query("SELECT count(*)::int AS n FROM sales.receipts WHERE reference = 'pay_B'")).rows[0].n, 1);
  });

  test('not paid in time: cancelled and the bags released; a late payment is kept and flagged', async () => {
    const r = await site((c) => checkout(c, buyer({ lines: [{ itemId: sku['CPR-5KG'], qty: 3 }] }), { rp, keys }));
    const before = await stockOf('CPR-5KG');
    await app.query("UPDATE sales.orders SET created_at = now() - interval '31 minutes' WHERE id = $1", [r.orderId]);
    const expired = await site((c) => expireUnpaid(c));
    assert.deepEqual(expired, [r.orderNumber]);
    assert.equal((await site((c) => getOrder(c, r.orderId))).status, 'cancelled');
    assert.equal((await stockOf('CPR-5KG')).reserved, before.reserved - 3);
    // Razorpay's nightly list still has a payment for it.
    const done = await site((c) => reconcile(c, [{ id: 'pay_C', order_id: r.razorpay.orderId, amount: r.amountPaise, status: 'captured', method: 'card' }, { id: 'pay_X', order_id: 'order_NOT_OURS', amount: 100, status: 'captured' }]));
    assert.deepEqual(done, [{ payment: 'pay_C', result: 'paid late' }]);
    assert.equal((await app.query("SELECT status FROM pay.razorpay_orders WHERE order_id = $1", [r.orderId])).rows[0].status, 'paid_late');
    assert.equal((await site((c) => reconcile(c, [{ id: 'pay_C', order_id: r.razorpay.orderId, amount: r.amountPaise, status: 'captured' }]))).length, 0);
  });

  test('people can cancel a waiting order (bags released) but cannot confirm it by hand', async () => {
    const r = await site((c) => checkout(c, buyer({ lines: [{ itemId: sku['CPR-5KG'], qty: 1 }] }), { rp, keys }));
    await assert.rejects(boss((c) => moveOrder(c, r.orderId, 'confirmed', {}, { isAdmin: true })), /cannot be marked confirmed/);
    const reserved = (await stockOf('CPR-5KG')).reserved;
    await boss((c) => moveOrder(c, r.orderId, 'cancelled', { reason: 'Customer called to cancel' }, { isAdmin: true }));
    assert.equal((await stockOf('CPR-5KG')).reserved, reserved - 1);
  });

  test('a refund gives the whole payment back, reverses the receipt and cancels the order', async () => {
    const r = await site((c) => checkout(c, buyer({ lines: [{ itemId: sku['CPR-5KG'], qty: 1 }] }), { rp, keys }));
    await webhook('evt_9', { id: 'pay_D', order_id: r.razorpay.orderId, amount: r.amountPaise, method: 'upi' });
    await assert.rejects(boss((c) => refundOrder(c, r.orderId, {}, { rp })), /reason/);
    await boss((c) => refundOrder(c, r.orderId, { reason: 'Out of delivery area' }, { rp }));
    assert.deepEqual(refunds.at(-1), { paymentId: 'pay_D', amount: r.amountPaise, notes: { reason: 'Out of delivery area' } });
    assert.equal((await site((c) => getOrder(c, r.orderId))).status, 'cancelled');
    assert.equal((await app.query("SELECT status FROM sales.receipts WHERE reference = 'pay_D'")).rows[0].status, 'reversed');
    await assert.rejects(boss((c) => refundOrder(c, r.orderId, { reason: 'again' }, { rp })), /no online payment/);
  });

  test('no more bags can be sold online than are free', async () => {
    const free = (await stockOf('CPR-5KG')).on_hand - (await stockOf('CPR-5KG')).reserved;
    await assert.rejects(site((c) => checkout(c, buyer({ lines: [{ itemId: sku['CPR-5KG'], qty: free + 1 }] }), { rp, keys })), /only \d+ of/);
  });

  test('pay-on-delivery and pickup orders are saved as New for the staff to confirm, without holding bags', async () => {
    const code = Object.keys(sku).find((k) => k.endsWith('-26KG'));
    await boss((c) => adjustStock(c, { itemId: sku[code], kind: 'opening', qty: 3 }));
    const before = await stockOf(code);
    const cod = await site((c) => placeOrder(c, buyer({ method: 'delivery', payment: 'upi', phone: '9000011111', lines: [{ itemId: sku[code], qty: 2 }] })));
    let o = await site((c) => getOrder(c, cod.orderId));
    assert.equal(o.status, 'new');
    assert.equal(o.source, 'website');
    assert.match(o.notes, /Pay on delivery: UPI/);
    assert.equal(o.ship_to.city, 'Coimbatore');
    assert.equal(cod.totalPaise > 0, true);
    assert.deepEqual(await stockOf(code), before);

    const pickup = await site((c) => placeOrder(c, { name: 'Ravi', phone: '9000022222', method: 'pickup', lines: [{ itemId: sku[code], qty: 1 }] }));
    o = await site((c) => getOrder(c, pickup.orderId));
    assert.equal(o.status, 'new');
    assert.equal(o.ship_to, null);
    assert.match(o.notes, /Pickup from the shop/);

    await assert.rejects(site((c) => placeOrder(c, buyer({ method: 'delivery', lines: [{ itemId: sku[code], qty: 4 }] }))), /only 3 of/);
    await assert.rejects(site((c) => placeOrder(c, { name: 'Ravi', phone: '12345', method: 'pickup', lines: [{ itemId: sku[code], qty: 1 }] })), /mobile number/);
    await assert.rejects(site((c) => placeOrder(c, { name: 'R', phone: '9000033333', method: 'pickup', lines: [{ itemId: sku[code], qty: 1 }] })), (e) => Boolean(e.fields?.name));
    // The staff confirm it as usual: then the bags are kept aside.
    await boss((c) => moveOrder(c, cod.orderId, 'confirmed', {}, { isAdmin: true }));
    assert.equal((await stockOf(code)).reserved, before.reserved + 2);
  });

  test('a website order keeps where the customer came from, and a bad source never stops it', async () => {
    const code = Object.keys(sku).find((k) => k.endsWith('-26KG'));
    await boss((c) => adjustStock(c, { itemId: sku[code], kind: 'opening', qty: 2 }));
    const now = Date.now();
    const attribution = {
      sid: 'session-abc123',
      vid: 'visitor-abc123',
      visit: { landing: '/products/seeraga-samba', referrer: '' },
      last: { utmSource: 'facebook', utmMedium: 'paid', utmCampaign: 'Pongal offer', clickId: 'fbclid', at: now - 86_400_000 },
      first: { referrer: 'https://www.google.com/', at: now - 10 * 86_400_000 },
    };
    const placed = await site((c) => placeOrder(c, { name: 'Meena', phone: '9000044444', method: 'pickup', attribution, lines: [{ itemId: sku[code], qty: 1 }] }));
    const row = (await app.query('SELECT * FROM sales.order_attribution WHERE order_id = $1', [placed.orderId])).rows[0];
    assert.equal(row.channel, 'Meta Ads');
    assert.equal(row.campaign, 'Pongal offer');
    assert.equal(row.click_id, 'fbclid');
    assert.equal(row.touch_from, 'an earlier visit');
    assert.equal(row.first_channel, 'Google search');
    assert.equal(row.session_id, 'session-abc123');

    // Nothing sent (an old page), or rubbish: the order still goes in, as Direct.
    const bare = await site((c) => placeOrder(c, { name: 'Meena', phone: '9000044444', method: 'pickup', attribution: 'x'.repeat(5000), lines: [{ itemId: sku[code], qty: 1 }] }));
    assert.equal((await app.query('SELECT channel FROM sales.order_attribution WHERE order_id = $1', [bare.orderId])).rows[0].channel, 'Direct');
  });
});
