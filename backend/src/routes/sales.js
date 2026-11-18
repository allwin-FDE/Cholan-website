// /api/admin/sales: orders, stock, GST invoices, returns, payments and what
// customers owe, on the business database.
//
// Viewer: look. Editor (staff): take and move orders, dispatch details,
// invoice, record payments. Admin and Owner: also cancel, returns, credit
// overrides, prices typed by hand, cancel invoices, reverse payments, stock
// changes and document numbering.
import { Router } from 'express';
import { handle, idOf, isAdmin, need, needDb } from './handle.js';
import {
  adjustStock,
  allocateReceipt,
  cancelInvoice,
  createInvoice,
  createOrder,
  createReceipt,
  dues,
  editOrder,
  getCreditNote,
  getInvoice,
  getOrder,
  listInvoices,
  listOrders,
  listReceipts,
  listSeries,
  listStock,
  moveOrder,
  partyAccount,
  previewOrder,
  recordReturn,
  reverseReceipt,
  saveDispatch,
  setSeries,
  stockMoves,
} from '../lib/sales.js';

const router = Router();
router.use(needDb);
const body = (req) => req.body || {};
const orderId = (req) => need(idOf(req.params.id), 'Order');

// Orders
router.get('/orders', ...handle('viewer', async (c, req) => ({ orders: await listOrders(c, { status: String(req.query.status || ''), q: String(req.query.q || '') }) })));
router.post('/orders/preview', ...handle('editor', (c, req) => previewOrder(c, body(req), { canSetPrice: isAdmin(req) })));
router.post('/orders', ...handle('editor', async (c, req) => getOrder(c, await createOrder(c, body(req), { canSetPrice: isAdmin(req) }))));
router.get('/orders/:id', ...handle('viewer', (c, req) => getOrder(c, orderId(req))));
router.put(
  '/orders/:id',
  ...handle('editor', async (c, req) => {
    await editOrder(c, orderId(req), body(req), { canSetPrice: isAdmin(req) });
    return getOrder(c, orderId(req));
  }),
);
router.post(
  '/orders/:id/move',
  ...handle('editor', async (c, req) => {
    await moveOrder(c, orderId(req), String(body(req).to || ''), body(req), { isAdmin: isAdmin(req) });
    return getOrder(c, orderId(req));
  }),
);
router.post(
  '/orders/:id/dispatch',
  ...handle('editor', async (c, req) => {
    await saveDispatch(c, orderId(req), body(req));
    return getOrder(c, orderId(req));
  }),
);
router.post(
  '/orders/:id/invoice',
  ...handle('editor', async (c, req) => {
    await createInvoice(c, orderId(req), body(req));
    return getOrder(c, orderId(req));
  }),
);
router.post(
  '/orders/:id/returns',
  ...handle('admin', async (c, req) => {
    await recordReturn(c, orderId(req), body(req));
    return getOrder(c, orderId(req));
  }),
);

// Invoices and credit notes
router.get('/invoices', ...handle('viewer', async (c, req) => ({ invoices: await listInvoices(c, { q: String(req.query.q || ''), partyId: idOf(req.query.partyId) }) })));
router.get('/invoices/:id', ...handle('viewer', (c, req) => getInvoice(c, need(idOf(req.params.id), 'Invoice'))));
router.post(
  '/invoices/:id/cancel',
  ...handle('admin', async (c, req) => {
    const id = need(idOf(req.params.id), 'Invoice');
    await cancelInvoice(c, id, body(req));
    return getInvoice(c, id);
  }),
);
router.get('/credit-notes/:id', ...handle('viewer', (c, req) => getCreditNote(c, need(idOf(req.params.id), 'Credit note'))));

// Payments and what is owed
router.get('/receipts', ...handle('viewer', async (c, req) => ({ receipts: await listReceipts(c, { partyId: idOf(req.query.partyId) }) })));
router.post(
  '/receipts',
  ...handle('editor', async (c, req) => {
    const id = await createReceipt(c, body(req));
    return { id, account: await partyAccount(c, Number(body(req).partyId)) };
  }),
);
router.post(
  '/receipts/:id/allocate',
  ...handle('editor', async (c, req) => {
    await allocateReceipt(c, need(idOf(req.params.id), 'Receipt'), body(req));
    return { ok: true };
  }),
);
router.post(
  '/receipts/:id/reverse',
  ...handle('admin', async (c, req) => {
    await reverseReceipt(c, need(idOf(req.params.id), 'Receipt'), body(req));
    return { ok: true };
  }),
);
router.get('/dues', ...handle('viewer', async (c) => ({ dues: await dues(c) })));
router.get('/accounts/:partyId', ...handle('viewer', (c, req) => partyAccount(c, need(idOf(req.params.partyId), 'Customer'))));

// Stock
router.get('/stock', ...handle('viewer', async (c) => ({ stock: await listStock(c) })));
router.get('/stock/:itemId/moves', ...handle('viewer', async (c, req) => ({ moves: await stockMoves(c, need(idOf(req.params.itemId), 'Item')) })));
router.post(
  '/stock/adjust',
  ...handle('admin', async (c, req) => {
    await adjustStock(c, body(req));
    return { stock: await listStock(c) };
  }),
);

// Document numbering
router.get('/series', ...handle('viewer', async (c) => ({ series: await listSeries(c) })));
router.post(
  '/series',
  ...handle('admin', async (c, req) => {
    await setSeries(c, body(req));
    return { series: await listSeries(c) };
  }),
);

export default router;
