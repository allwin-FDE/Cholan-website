// /api/warehouse/* — orders, stock, payments and invoices, behind the warehouse
// sign-in. Each route states the least level it needs (lib/auth.js). Anything
// that counts (stock, order and invoice numbers, payments) runs in a Firestore
// transaction, so two people acting at once cannot both take the last bag.
import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import { accessCollection, auth, requireWarehouse, WAREHOUSE_ROLES } from '../lib/auth.js';
import { collection, firestore } from '../lib/firestore.js';
import {
  DEFAULT_SETTINGS,
  MANAGER_STEPS,
  PAYMENT_METHODS,
  amountInWords,
  canMove,
  cleanOrder,
  cleanSettings,
  computeTotals,
  financialYear,
  forLevel,
  isInterstate,
  sameBags,
  stockEffect,
  stockId,
  toPaise,
} from '../lib/warehouse.js';

const router = Router();
router.use(express.json({ limit: '256kb' }));
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const staff = requireWarehouse('staff');
const manager = requireWarehouse('manager');
const adminOnly = requireWarehouse('admin');

const orders = () => collection('whOrders');
const stock = () => collection('whStock');
const moves = () => collection('whStockMoves');
const payments = () => collection('whPayments');
const invoices = () => collection('whInvoices');
const counters = () => collection('whCounters');
const activity = () => collection('whActivity');
const settingsDoc = () => collection('whSettings').doc('main');

const nowIso = () => new Date().toISOString();
const clientError = (message, status = 400, fields) => Object.assign(new Error(message), { status, fields, expose: true });
const send = (res, error, next) => (error.expose ? res.status(error.status).json({ error: error.message, fields: error.fields }) : next(error));
// A route whose failures are meant for the person, such as "not enough stock".
const act = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch((error) => send(res, error, next));
const isManager = (req) => req.user.level !== 'staff';

async function loadSettings() {
  const doc = await settingsDoc().get();
  const saved = doc.exists ? doc.data() : {};
  return { ...DEFAULT_SETTINGS, ...saved, seller: { ...DEFAULT_SETTINGS.seller, ...saved.seller } };
}

// One line in the activity log, and on the order's own history.
const entry = (req, action, detail = '', money = false) => ({ at: nowIso(), by: req.user.name, action, detail, money });
function logActivity(tx, req, { action, detail = '', money = false, orderId = '', orderNumber = '' }) {
  tx.set(activity().doc(), { at: nowIso(), by: req.user.name, byEmail: req.user.email, action, detail, money, orderId, orderNumber });
}

// The next number in a series. Inside the transaction, so a failed save uses no
// number, and the series has no gaps.
async function nextNumber(tx, key) {
  const ref = counters().doc(key);
  const doc = await tx.get(ref);
  const next = (doc.exists ? doc.data().next : 0) + 1;
  return { next, save: () => tx.set(ref, { next }) };
}

const orderTotals = (items, customer, settings) => {
  const { lines, ...totals } = computeTotals(items, { inclusive: settings.pricesIncludeGst, interstate: isInterstate(customer, settings.seller) });
  return totals;
};

// ---- Who am I ----
router.get('/me', staff, (req, res) => res.json(req.user));

// ---- Today ----
router.get(
  '/summary',
  staff,
  wrap(async (req, res) => {
    const [orderSnap, stockSnap] = await Promise.all([orders().orderBy('createdAt', 'desc').limit(1000).get(), stock().get()]);
    const all = orderSnap.docs.map((doc) => doc.data());
    const counts = {};
    for (const order of all) counts[order.status] = (counts[order.status] || 0) + 1;
    const low = stockSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => (item.onHand || 0) - (item.reserved || 0) <= (item.low || 0))
      .map(({ id, name, pack, onHand = 0, reserved = 0, low: level = 0 }) => ({ id, name, pack, onHand, reserved, low: level }));
    const body = { counts, low };
    if (isManager(req)) {
      const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      const india = (iso) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      const live = all.filter((order) => !['cancelled', 'returned'].includes(order.status));
      body.todaySalesPaise = live.filter((order) => india(order.createdAt) === today).reduce((sum, order) => sum + (order.totalPaise || 0), 0);
      body.duePaise = live.reduce((sum, order) => sum + Math.max(0, (order.totalPaise || 0) - (order.paidPaise || 0)), 0);
    }
    res.json(body);
  }),
);

// ---- Orders ----
router.get(
  '/orders',
  staff,
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 1000, 3000);
    const snap = await orders().orderBy('createdAt', 'desc').limit(limit).get();
    res.json({ orders: snap.docs.map((doc) => forLevel({ id: doc.id, ...doc.data() }, req.user.level)) });
  }),
);

router.post(
  '/orders',
  staff,
  act(async (req, res) => {
    const settings = await loadSettings();
    const { value, errors } = cleanOrder(req.body, { settings, manager: isManager(req) });
    if (errors) throw clientError('Please check the order.', 400, errors);
    const db = firestore();
    const ref = orders().doc();
    const saved = await db.runTransaction(async (tx) => {
      const number = await nextNumber(tx, 'order');
      const order = {
        ...value,
        ...orderTotals(value.items, value.customer, settings),
        number: `CO-${String(number.next).padStart(5, '0')}`,
        status: 'new',
        paidPaise: 0,
        createdAt: nowIso(),
        createdBy: req.user.name,
        updatedAt: nowIso(),
        history: [entry(req, 'Order created')],
      };
      number.save();
      tx.set(ref, order);
      logActivity(tx, req, { action: 'Order created', orderId: ref.id, orderNumber: order.number, detail: order.customer.name });
      return order;
    });
    res.status(201).json(forLevel({ id: ref.id, ...saved }, req.user.level));
  }),
);

router.get(
  '/orders/:id',
  staff,
  act(async (req, res) => {
    const doc = await orders().doc(req.params.id).get();
    if (!doc.exists) throw clientError('Order not found.', 404);
    const body = forLevel({ id: doc.id, ...doc.data() }, req.user.level);
    if (isManager(req)) {
      const paid = await payments().where('orderId', '==', doc.id).get();
      body.payments = paid.docs.map((p) => ({ id: p.id, ...p.data() })).sort((a, b) => a.at.localeCompare(b.at));
    }
    res.json(body);
  }),
);

// Customer and notes may change until dispatch. The bags only while the order
// is new, so a reservation always matches its order. A manager may correct
// prices any time before the invoice.
router.patch(
  '/orders/:id',
  staff,
  act(async (req, res) => {
    const settings = await loadSettings();
    const ref = orders().doc(req.params.id);
    const saved = await firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw clientError('Order not found.', 404);
      const order = doc.data();
      if (['dispatched', 'delivered', 'cancelled', 'returned'].includes(order.status)) {
        throw clientError('This order can no longer be changed.', 409);
      }
      const { value, errors } = cleanOrder(req.body, { settings, manager: isManager(req), existing: order });
      if (errors) throw clientError('Please check the order.', 400, errors);
      if (order.status !== 'new' && !sameBags(value.items, order.items)) {
        throw clientError('Products can only be changed while the order is new.', 409);
      }
      const pricesChanged = JSON.stringify(value.items.map((i) => [i.productId, i.pack, i.unitPaise])) !== JSON.stringify(order.items.map((i) => [i.productId, i.pack, i.unitPaise]));
      if (order.invoiceId && (pricesChanged || !sameBags(value.items, order.items) || isInterstate(value.customer, settings.seller) !== isInterstate(order.customer, settings.seller))) {
        throw clientError('This order has an invoice. Cancel the invoice before changing it.', 409);
      }
      const totals = orderTotals(value.items, value.customer, settings);
      if (totals.totalPaise < (order.paidPaise || 0)) throw clientError('This would make the order less than what has been paid.', 409);
      const update = { ...value, ...totals, source: order.source, updatedAt: nowIso(), history: [...order.history, entry(req, 'Order edited')] };
      tx.update(ref, update);
      logActivity(tx, req, { action: 'Order edited', orderId: ref.id, orderNumber: order.number });
      return { ...order, ...update };
    });
    res.json(forLevel({ id: ref.id, ...saved }, req.user.level));
  }),
);

// A step forward or back, and what it does to the stock.
const STEP_LABELS = { confirmed: 'Confirmed', packing: 'Packing started', packed: 'Packed', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };
router.post(
  '/orders/:id/status',
  staff,
  act(async (req, res) => {
    const to = String(req.body?.to || '');
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
    const condition = req.body?.condition === 'damaged' ? 'damaged' : 'good';
    if (MANAGER_STEPS.includes(to) && !isManager(req)) throw clientError('Only a manager can do this.', 403);
    if (MANAGER_STEPS.includes(to) && !note) throw clientError('Please give a reason.');
    const ref = orders().doc(req.params.id);
    const saved = await firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw clientError('Order not found.', 404);
      const order = doc.data();
      if (!canMove(order.status, to)) throw clientError(`An order that is ${order.status} cannot become ${to}.`, 409);
      if (to === 'cancelled' && order.invoiceId) throw clientError('Cancel the invoice first.', 409);
      if (to === 'cancelled' && (order.paidPaise || 0) > 0) throw clientError('This order has payments. Reverse them first.', 409);

      const effect = stockEffect(order.status, to, condition);
      if (effect) {
        const refs = order.items.map((item) => stock().doc(stockId(item.productId, item.pack)));
        const docs = await tx.getAll(...refs);
        const short = [];
        const writes = order.items.map((item, i) => {
          const current = docs[i].exists ? docs[i].data() : {};
          const onHand = (current.onHand || 0) + effect.onHand * item.qty;
          if (onHand < 0) short.push(`${item.name} ${item.pack}: ${current.onHand || 0} in hand, ${item.qty} needed`);
          const reserved = Math.max(0, (current.reserved || 0) + effect.reserved * item.qty);
          const damaged = (current.damaged || 0) + effect.damaged * item.qty;
          return { ref: refs[i], item, onHand, reserved, damaged };
        });
        if (short.length) throw clientError(`Not enough stock. ${short.join('; ')}.`, 409);
        for (const w of writes) {
          tx.set(w.ref, { productId: w.item.productId, name: w.item.name, pack: w.item.pack, onHand: w.onHand, reserved: w.reserved, damaged: w.damaged, updatedAt: nowIso() }, { merge: true });
          tx.set(moves().doc(), {
            at: nowIso(),
            by: req.user.name,
            stockId: w.ref.id,
            name: w.item.name,
            pack: w.item.pack,
            type: effect.type,
            onHandChange: effect.onHand * w.item.qty,
            reservedChange: effect.reserved * w.item.qty,
            damagedChange: effect.damaged * w.item.qty,
            onHandAfter: w.onHand,
            orderId: ref.id,
            orderNumber: order.number,
            reason: note,
          });
        }
      }
      const label = STEP_LABELS[to] || to;
      const update = { status: to, updatedAt: nowIso(), [`${to}At`]: nowIso(), history: [...order.history, entry(req, label, note)] };
      tx.update(ref, update);
      logActivity(tx, req, { action: label, detail: note, orderId: ref.id, orderNumber: order.number });
      return { ...order, ...update };
    });
    res.json(forLevel({ id: ref.id, ...saved }, req.user.level));
  }),
);

// ---- Customers: built from the orders, one per phone number ----
router.get(
  '/customers',
  staff,
  wrap(async (req, res) => {
    const snap = await orders().orderBy('createdAt', 'desc').limit(3000).get();
    const byPhone = new Map();
    for (const doc of snap.docs) {
      const order = doc.data();
      const key = order.customer.phone.replace(/\D/g, '').slice(-10);
      const person = byPhone.get(key) || { key, ...order.customer, orderCount: 0, lastOrderAt: order.createdAt, orders: [], totalPaise: 0, duePaise: 0 };
      person.orderCount += 1;
      person.orders.push({ id: doc.id, number: order.number, status: order.status, createdAt: order.createdAt, ...(isManager(req) ? { totalPaise: order.totalPaise, paidPaise: order.paidPaise } : {}) });
      if (isManager(req) && !['cancelled', 'returned'].includes(order.status)) {
        person.totalPaise += order.totalPaise || 0;
        person.duePaise += Math.max(0, (order.totalPaise || 0) - (order.paidPaise || 0));
      }
      byPhone.set(key, person);
    }
    const customers = [...byPhone.values()];
    if (!isManager(req)) for (const person of customers) { delete person.totalPaise; delete person.duePaise; }
    res.json({ customers });
  }),
);

// ---- Stock ----
router.get(
  '/stock',
  staff,
  wrap(async (req, res) => {
    const snap = await stock().get();
    res.json({ stock: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  }),
);

router.get(
  '/stock/moves',
  staff,
  wrap(async (req, res) => {
    const snap = await moves().orderBy('at', 'desc').limit(Math.min(Number(req.query.limit) || 500, 2000)).get();
    res.json({ moves: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  }),
);

function stockBody(body) {
  const productId = typeof body?.productId === 'string' ? body.productId : '';
  const pack = typeof body?.pack === 'string' ? body.pack.trim() : '';
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (!/^[a-z0-9-]{1,80}$/.test(productId) || !/^[\w .-]{1,20}$/.test(pack) || !name) throw clientError('Choose a product and size.');
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
  return { productId, pack, name, reason };
}

// Goods coming in.
router.post(
  '/stock/receive',
  staff,
  act(async (req, res) => {
    const { productId, pack, name, reason } = stockBody(req.body);
    const qty = Number(req.body?.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000000) throw clientError('Enter how many bags came in.');
    const ref = stock().doc(stockId(productId, pack));
    const saved = await firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const onHand = (doc.exists ? doc.data().onHand || 0 : 0) + qty;
      tx.set(ref, { productId, name, pack, onHand, updatedAt: nowIso() }, { merge: true });
      tx.set(moves().doc(), { at: nowIso(), by: req.user.name, stockId: ref.id, name, pack, type: 'receive', onHandChange: qty, reservedChange: 0, damagedChange: 0, onHandAfter: onHand, reason });
      logActivity(tx, req, { action: 'Stock received', detail: `${qty} × ${name} ${pack}${reason ? ` (${reason})` : ''}` });
      return { ...(doc.exists ? doc.data() : {}), productId, name, pack, onHand };
    });
    res.json({ id: ref.id, ...saved });
  }),
);

// A correction: the counted figure replaces what the system says.
router.post(
  '/stock/adjust',
  manager,
  act(async (req, res) => {
    const { productId, pack, name, reason } = stockBody(req.body);
    const counted = Number(req.body?.counted);
    if (!Number.isInteger(counted) || counted < 0 || counted > 1000000) throw clientError('Enter the number of bags you counted.');
    if (!reason) throw clientError('Please give a reason.');
    const ref = stock().doc(stockId(productId, pack));
    const saved = await firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const before = doc.exists ? doc.data().onHand || 0 : 0;
      tx.set(ref, { productId, name, pack, onHand: counted, updatedAt: nowIso() }, { merge: true });
      tx.set(moves().doc(), { at: nowIso(), by: req.user.name, stockId: ref.id, name, pack, type: 'adjust', onHandChange: counted - before, reservedChange: 0, damagedChange: 0, onHandAfter: counted, reason });
      logActivity(tx, req, { action: 'Stock adjusted', detail: `${name} ${pack}: ${before} to ${counted} (${reason})` });
      return { ...(doc.exists ? doc.data() : {}), productId, name, pack, onHand: counted };
    });
    res.json({ id: ref.id, ...saved });
  }),
);

router.patch(
  '/stock/low',
  manager,
  act(async (req, res) => {
    const { productId, pack, name } = stockBody(req.body);
    const low = Number(req.body?.low);
    if (!Number.isInteger(low) || low < 0 || low > 1000000) throw clientError('Enter a whole number.');
    const ref = stock().doc(stockId(productId, pack));
    await ref.set({ productId, name, pack, low, updatedAt: nowIso() }, { merge: true });
    res.json({ id: ref.id, low });
  }),
);

// ---- Payments ----
router.get(
  '/payments',
  manager,
  wrap(async (req, res) => {
    const snap = await payments().orderBy('at', 'desc').limit(1000).get();
    res.json({ payments: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  }),
);

router.post(
  '/orders/:id/payments',
  manager,
  act(async (req, res) => {
    const amountPaise = toPaise(req.body?.amount);
    if (!amountPaise) throw clientError('Enter the amount received.');
    const method = PAYMENT_METHODS.includes(req.body?.method) ? req.body.method : null;
    if (!method) throw clientError('Choose how it was paid.');
    const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim().slice(0, 80) : '';
    const ref = orders().doc(req.params.id);
    const paymentRef = payments().doc();
    const saved = await firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw clientError('Order not found.', 404);
      const order = doc.data();
      if (['cancelled', 'returned'].includes(order.status)) throw clientError('This order is closed.', 409);
      const due = (order.totalPaise || 0) - (order.paidPaise || 0);
      if (amountPaise > due) throw clientError(`That is more than the ₹${(due / 100).toFixed(2)} due on this order.`, 409);
      const detail = `₹${(amountPaise / 100).toFixed(2)} by ${method}${reference ? ` (${reference})` : ''}`;
      const update = { paidPaise: (order.paidPaise || 0) + amountPaise, updatedAt: nowIso(), history: [...order.history, entry(req, 'Payment received', detail, true)] };
      tx.update(ref, update);
      tx.set(paymentRef, { orderId: ref.id, orderNumber: order.number, customerName: order.customer.name, customerPhone: order.customer.phone, amountPaise, method, reference, at: nowIso(), by: req.user.name, reversed: false });
      logActivity(tx, req, { action: 'Payment received', detail, money: true, orderId: ref.id, orderNumber: order.number });
      return { ...order, ...update };
    });
    res.status(201).json(forLevel({ id: ref.id, ...saved }, req.user.level));
  }),
);

// A payment is never deleted: a mistake is reversed, with the reason kept.
router.post(
  '/payments/:id/reverse',
  manager,
  act(async (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
    if (!reason) throw clientError('Please give a reason.');
    const paymentRef = payments().doc(req.params.id);
    await firestore().runTransaction(async (tx) => {
      const paymentDoc = await tx.get(paymentRef);
      if (!paymentDoc.exists) throw clientError('Payment not found.', 404);
      const payment = paymentDoc.data();
      if (payment.reversed) throw clientError('This payment has already been reversed.', 409);
      const orderRef = orders().doc(payment.orderId);
      const orderDoc = await tx.get(orderRef);
      const order = orderDoc.data();
      const detail = `₹${(payment.amountPaise / 100).toFixed(2)}: ${reason}`;
      tx.update(paymentRef, { reversed: true, reversedAt: nowIso(), reversedBy: req.user.name, reverseReason: reason });
      tx.update(orderRef, { paidPaise: Math.max(0, (order.paidPaise || 0) - payment.amountPaise), updatedAt: nowIso(), history: [...order.history, entry(req, 'Payment reversed', detail, true)] });
      logActivity(tx, req, { action: 'Payment reversed', detail, money: true, orderId: payment.orderId, orderNumber: order.number });
    });
    res.json({ ok: true });
  }),
);

// ---- Invoices ----
router.get(
  '/invoices',
  manager,
  wrap(async (req, res) => {
    const snap = await invoices().orderBy('createdAt', 'desc').limit(2000).get();
    res.json({ invoices: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  }),
);

router.get(
  '/invoices/:id',
  manager,
  act(async (req, res) => {
    const doc = await invoices().doc(req.params.id).get();
    if (!doc.exists) throw clientError('Invoice not found.', 404);
    res.json({ id: doc.id, ...doc.data() });
  }),
);

// Everything is frozen into the invoice: later price or address changes never
// alter one already issued.
router.post(
  '/orders/:id/invoice',
  manager,
  act(async (req, res) => {
    const settings = await loadSettings();
    const { seller } = settings;
    if (!seller.gstin || !seller.legalName) throw clientError('Add your company name and GSTIN in Settings first.', 409);
    const ref = orders().doc(req.params.id);
    const invoiceRef = invoices().doc();
    const saved = await firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw clientError('Order not found.', 404);
      const order = doc.data();
      if (order.invoiceId) throw clientError(`This order already has invoice ${order.invoiceNumber}.`, 409);
      if (['cancelled', 'returned', 'new'].includes(order.status)) throw clientError('Confirm the order before making its invoice.', 409);
      const items = order.items.map((item) => ({ ...item, gstRate: item.gstRate ?? settings.gst[item.productId] ?? null, hsn: settings.hsn[item.productId] || item.hsn || settings.defaultHsn }));
      const unpriced = items.filter((item) => !item.unitPaise).map((item) => item.name);
      if (unpriced.length) throw clientError(`Add a price for: ${unpriced.join(', ')}.`, 409);
      const untaxed = items.filter((item) => item.gstRate === null).map((item) => item.name);
      if (untaxed.length) throw clientError(`Set the GST rate in Settings for: ${untaxed.join(', ')}.`, 409);

      const interstate = isInterstate(order.customer, seller);
      const { lines, ...totals } = computeTotals(items, { inclusive: settings.pricesIncludeGst, interstate });
      if (totals.totalPaise < (order.paidPaise || 0)) throw clientError('The total is now less than what has been paid. Reverse the extra payment first.', 409);
      const year = financialYear();
      const number = await nextNumber(tx, `invoice-${year}`);
      const invoiceNumber = `CR/${year}/${String(number.next).padStart(4, '0')}`;
      const invoice = {
        number: invoiceNumber,
        financialYear: year,
        orderId: ref.id,
        orderNumber: order.number,
        status: 'issued',
        createdAt: nowIso(),
        createdBy: req.user.name,
        seller,
        buyer: order.customer,
        interstate,
        pricesIncludeGst: settings.pricesIncludeGst,
        lines,
        ...totals,
        amountInWords: amountInWords(totals.totalPaise),
      };
      number.save();
      tx.set(invoiceRef, invoice);
      const update = { items, ...totals, invoiceId: invoiceRef.id, invoiceNumber, updatedAt: nowIso(), history: [...order.history, entry(req, 'Invoice issued', invoiceNumber, true)] };
      tx.update(ref, update);
      logActivity(tx, req, { action: 'Invoice issued', detail: invoiceNumber, money: true, orderId: ref.id, orderNumber: order.number });
      return { id: invoiceRef.id, ...invoice };
    });
    res.status(201).json(saved);
  }),
);

// Never deleted: it stays in the list, marked cancelled, with the reason.
router.post(
  '/invoices/:id/cancel',
  manager,
  act(async (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
    if (!reason) throw clientError('Please give a reason.');
    const ref = invoices().doc(req.params.id);
    await firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) throw clientError('Invoice not found.', 404);
      const invoice = doc.data();
      if (invoice.status === 'cancelled') throw clientError('This invoice is already cancelled.', 409);
      const orderRef = orders().doc(invoice.orderId);
      const orderDoc = await tx.get(orderRef);
      const order = orderDoc.data();
      tx.update(ref, { status: 'cancelled', cancelledAt: nowIso(), cancelledBy: req.user.name, cancelReason: reason });
      tx.update(orderRef, { invoiceId: '', invoiceNumber: '', updatedAt: nowIso(), history: [...order.history, entry(req, 'Invoice cancelled', `${invoice.number}: ${reason}`, true)] });
      logActivity(tx, req, { action: 'Invoice cancelled', detail: `${invoice.number}: ${reason}`, money: true, orderId: invoice.orderId, orderNumber: invoice.orderNumber });
    });
    res.json({ ok: true });
  }),
);

// ---- Settings: prices, GST and what the invoice says ----
router.get('/settings', manager, wrap(async (req, res) => res.json(await loadSettings())));
router.put(
  '/settings',
  manager,
  wrap(async (req, res) => {
    const clean = cleanSettings(req.body);
    await settingsDoc().set({ ...clean, updatedAt: nowIso(), updatedBy: req.user.name });
    await activity().add({ at: nowIso(), by: req.user.name, byEmail: req.user.email, action: 'Settings changed', detail: '', money: true, orderId: '', orderNumber: '' });
    res.json(clean);
  }),
);

// ---- Activity ----
router.get(
  '/activity',
  manager,
  wrap(async (req, res) => {
    const snap = await activity().orderBy('at', 'desc').limit(Math.min(Number(req.query.limit) || 300, 1000)).get();
    res.json({ activity: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  }),
);

// ---- Team: workers log in with a username; behind it is a private address ----
const STAFF_DOMAIN = 'staff.cholanrice.in';
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const roleOfLevel = (level) => (level === 'manager' ? 'warehouse-manager' : 'warehouse-staff');
const ownWorker = (email, entry) => email.endsWith(`@${STAFF_DOMAIN}`) && WAREHOUSE_ROLES.includes(entry?.role);

router.get(
  '/team',
  adminOnly,
  wrap(async (req, res) => {
    const snap = await accessCollection().where('role', 'in', WAREHOUSE_ROLES).get();
    res.json({
      team: snap.docs
        .map((doc) => ({ email: doc.id, username: doc.data().username, name: doc.data().name, level: doc.data().role === 'warehouse-manager' ? 'manager' : 'staff', addedAt: doc.data().addedAt, addedBy: doc.data().addedBy }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }),
);

router.post(
  '/team',
  adminOnly,
  act(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim().slice(0, 60);
    const password = String(req.body?.password || '');
    const level = req.body?.level === 'manager' ? 'manager' : 'staff';
    const fields = {};
    if (!name) fields.name = 'Add their name.';
    if (!USERNAME.test(username)) fields.username = 'Use 3 to 30 small letters or numbers, no spaces.';
    if (password.length < 8) fields.password = 'Use at least 8 characters.';
    if (Object.keys(fields).length) throw clientError('Please check the details.', 400, fields);
    const email = `${username}@${STAFF_DOMAIN}`;
    try {
      await auth().createUser({ uid: `wh-${randomUUID()}`, email, emailVerified: true, password, displayName: name });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') throw clientError('That username is already taken.', 409, { username: 'That username is already taken.' });
      throw error;
    }
    const entry = { role: roleOfLevel(level), name, username, addedAt: nowIso(), addedBy: req.user.email };
    await accessCollection().doc(email).set(entry);
    await activity().add({ at: nowIso(), by: req.user.name, byEmail: req.user.email, action: 'Worker added', detail: `${name} (${level})`, money: false, orderId: '', orderNumber: '' });
    res.status(201).json({ email, username, name, level });
  }),
);

async function loadWorker(emailParam) {
  const email = String(emailParam || '').toLowerCase();
  const doc = await accessCollection().doc(email).get();
  if (!doc.exists || !ownWorker(email, doc.data())) throw clientError('Worker not found.', 404);
  return { email, ...doc.data() };
}

router.patch(
  '/team/:email',
  adminOnly,
  act(async (req, res) => {
    const worker = await loadWorker(req.params.email);
    const update = {};
    if (req.body?.level) update.role = roleOfLevel(req.body.level);
    if (req.body?.password !== undefined) {
      const password = String(req.body.password);
      if (password.length < 8) throw clientError('Use at least 8 characters.', 400, { password: 'Use at least 8 characters.' });
      const user = await auth().getUserByEmail(worker.email);
      await auth().updateUser(user.uid, { password });
      await auth().revokeRefreshTokens(user.uid);
    }
    if (Object.keys(update).length) await accessCollection().doc(worker.email).set(update, { merge: true });
    await activity().add({ at: nowIso(), by: req.user.name, byEmail: req.user.email, action: req.body?.password !== undefined ? 'Password reset' : 'Worker level changed', detail: worker.name, money: false, orderId: '', orderNumber: '' });
    res.json({ ok: true });
  }),
);

// Their name stays on everything they did.
router.delete(
  '/team/:email',
  adminOnly,
  act(async (req, res) => {
    const worker = await loadWorker(req.params.email);
    await accessCollection().doc(worker.email).delete();
    try {
      const user = await auth().getUserByEmail(worker.email);
      await auth().deleteUser(user.uid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
    }
    await activity().add({ at: nowIso(), by: req.user.name, byEmail: req.user.email, action: 'Worker removed', detail: worker.name, money: false, orderId: '', orderNumber: '' });
    res.json({ ok: true });
  }),
);

export default router;
