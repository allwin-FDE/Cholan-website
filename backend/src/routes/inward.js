// /api/admin/inward: Phase 3 on the business database — branches and places,
// batches, transfers, purchases (orders, goods received, supplier bills,
// payments, returns), packing runs, stock changes for approval, and expenses.
//
// Viewer: look. Editor (staff): send and receive transfers, goods received,
// packing runs, ask for stock changes, enter supplier bills, pay suppliers
// and enter expenses. Admin and Owner: also branches, purchase orders,
// approving stock changes, cancelling bills, transfers and expenses,
// reversing payments, purchase returns and expense categories.
import { Router } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { config } from '../config.js';
import { requireRole } from '../lib/auth.js';
import { withTx } from '../db/pool.js';
import { handle, idOf, need, needDb } from './handle.js';
import * as w from '../lib/inward.js';

const router = Router();
router.use(needDb);
const body = (req) => req.body || {};
const idParam = (what) => (req) => need(idOf(req.params.id), what);

// Branches and places
router.get('/branches', ...handle('viewer', (c) => w.listBranches(c)));
router.post('/branches', ...handle('admin', async (c, req) => (await w.saveBranch(c, null, body(req)), w.listBranches(c))));
router.put('/branches/:id', ...handle('admin', async (c, req) => (await w.saveBranch(c, idParam('Branch')(req), body(req)), w.listBranches(c))));
router.post('/branches/:id/locations', ...handle('admin', async (c, req) => (await w.saveLocation(c, idParam('Branch')(req), null, body(req)), w.listBranches(c))));
router.put(
  '/branches/:id/locations/:locationId',
  ...handle('admin', async (c, req) => (await w.saveLocation(c, idParam('Branch')(req), need(idOf(req.params.locationId), 'Place'), body(req)), w.listBranches(c))),
);
router.get('/stock', ...handle('viewer', async (c, req) => ({ stock: await w.stockByPlace(c, { locationId: idOf(req.query.locationId) }) })));

// Batches
router.get('/batches', ...handle('viewer', async (c, req) => ({ batches: await w.listBatches(c, { itemId: idOf(req.query.itemId), locationId: idOf(req.query.locationId) }) })));
router.get('/batches/:id', ...handle('viewer', (c, req) => w.batchTrace(c, idParam('Batch')(req))));

// Transfers
router.get('/transfers', ...handle('viewer', async (c) => ({ transfers: await w.listTransfers(c) })));
router.get('/transfers/:id', ...handle('viewer', (c, req) => w.getTransfer(c, idParam('Transfer')(req))));
router.post('/transfers', ...handle('editor', async (c, req) => w.getTransfer(c, await w.createTransfer(c, body(req)))));
router.post('/transfers/:id/receive', ...handle('editor', async (c, req) => (await w.receiveTransfer(c, idParam('Transfer')(req), body(req)), w.getTransfer(c, idParam('Transfer')(req)))));
router.post('/transfers/:id/cancel', ...handle('admin', async (c, req) => (await w.cancelTransfer(c, idParam('Transfer')(req), body(req)), w.getTransfer(c, idParam('Transfer')(req)))));

// Purchase orders
router.get('/purchase-orders', ...handle('viewer', async (c, req) => ({ orders: await w.listPurchaseOrders(c, { status: req.query.status || '' }) })));
router.get('/purchase-orders/:id', ...handle('viewer', (c, req) => w.getPurchaseOrder(c, idParam('Purchase order')(req))));
router.post('/purchase-orders', ...handle('admin', async (c, req) => w.getPurchaseOrder(c, await w.createPurchaseOrder(c, body(req)))));
router.post(
  '/purchase-orders/:id/status',
  ...handle('admin', async (c, req) => (await w.setPurchaseOrderStatus(c, idParam('Purchase order')(req), body(req)), w.getPurchaseOrder(c, idParam('Purchase order')(req)))),
);

// Goods received
router.get('/goods-received', ...handle('viewer', async (c) => ({ receipts: await w.listGoodsReceived(c) })));
router.get('/goods-received/:id', ...handle('viewer', (c, req) => w.getGoodsReceived(c, idParam('Goods received note')(req))));
router.post('/goods-received', ...handle('editor', async (c, req) => w.getGoodsReceived(c, await w.createGoodsReceived(c, body(req)))));

// Supplier bills, payments and what is owed
router.get('/bills', ...handle('viewer', async (c, req) => ({ bills: await w.listBills(c, { partyId: idOf(req.query.partyId), q: String(req.query.q || '') }) })));
router.get('/bills/:id', ...handle('viewer', (c, req) => w.getBill(c, idParam('Bill')(req))));
router.post('/bills', ...handle('editor', async (c, req) => w.getBill(c, await w.createBill(c, body(req)))));
router.post('/bills/:id/cancel', ...handle('admin', async (c, req) => (await w.cancelBill(c, idParam('Bill')(req), body(req)), w.getBill(c, idParam('Bill')(req)))));
router.get('/supplier-payments', ...handle('viewer', async (c, req) => ({ payments: await w.listSupplierPayments(c, { partyId: idOf(req.query.partyId) }) })));
router.post('/supplier-payments', ...handle('editor', async (c, req) => ({ id: await w.createSupplierPayment(c, body(req)), account: await w.supplierAccount(c, Number(body(req).partyId)) })));
router.post('/supplier-payments/:id/allocate', ...handle('editor', async (c, req) => (await w.allocateSupplierPayment(c, idParam('Payment')(req), body(req)), { ok: true })));
router.post('/supplier-payments/:id/reverse', ...handle('admin', async (c, req) => (await w.reverseSupplierPayment(c, idParam('Payment')(req), body(req)), { ok: true })));
router.get('/payables', ...handle('viewer', async (c) => ({ payables: await w.payables(c) })));
router.get('/suppliers/:id/account', ...handle('viewer', (c, req) => w.supplierAccount(c, idParam('Supplier')(req))));

// Purchase returns
router.get('/purchase-returns', ...handle('viewer', async (c) => ({ returns: await w.listPurchaseReturns(c) })));
router.post('/purchase-returns', ...handle('admin', async (c, req) => ({ id: await w.createPurchaseReturn(c, body(req)), returns: await w.listPurchaseReturns(c) })));

// Packing runs
router.get('/packing-runs', ...handle('viewer', async (c) => ({ runs: await w.listPackingRuns(c) })));
router.post('/packing-runs', ...handle('editor', async (c, req) => ({ id: await w.createPackingRun(c, body(req)), runs: await w.listPackingRuns(c) })));

// Stock changes for approval
router.get('/stock-requests', ...handle('viewer', async (c, req) => ({ requests: await w.listStockRequests(c, { status: req.query.status || '' }) })));
router.post('/stock-requests', ...handle('editor', async (c, req) => ({ id: await w.createStockRequest(c, body(req)), requests: await w.listStockRequests(c) })));
router.post('/stock-requests/:id/decide', ...handle('admin', async (c, req) => (await w.decideStockRequest(c, idParam('Request')(req), body(req)), { requests: await w.listStockRequests(c) })));

// Expenses
router.get('/expense-categories', ...handle('viewer', async (c) => ({ categories: await w.listExpenseCategories(c) })));
router.post('/expense-categories', ...handle('admin', async (c, req) => (await w.saveExpenseCategory(c, null, body(req)), { categories: await w.listExpenseCategories(c) })));
router.put('/expense-categories/:id', ...handle('admin', async (c, req) => (await w.saveExpenseCategory(c, idParam('Category')(req), body(req)), { categories: await w.listExpenseCategories(c) })));
router.get(
  '/expenses',
  ...handle('viewer', async (c, req) => ({ expenses: await w.listExpenses(c, { from: req.query.from || null, to: req.query.to || null, categoryId: idOf(req.query.categoryId) }) })),
);
router.post('/expenses', ...handle('editor', async (c, req) => ({ id: await w.createExpense(c, body(req)) })));
router.post('/expenses/:id/cancel', ...handle('admin', async (c, req) => (await w.cancelExpense(c, idParam('Expense')(req), body(req)), { ok: true })));

// The photo of an expense bill: kept private in the media bucket under
// expense-bills/, shown only to signed-in staff (never through /api/media).
const bucket = () => new Storage().bucket(config.mediaBucket);
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
router.post(
  '/expenses/:id/photo',
  requireRole('editor'),
  express.raw({ type: Object.keys(TYPES), limit: '8mb' }),
  async (req, res, next) => {
    try {
      const id = need(idOf(req.params.id), 'Expense');
      const ext = TYPES[req.headers['content-type']];
      if (!ext || !req.body?.length) return res.status(400).json({ error: 'Send a photo (JPEG, PNG, WebP) or a PDF of the bill.' });
      const path = `${config.firestore.prefix}expense-bills/${id}-${randomUUID()}.${ext}`;
      await bucket().file(path).save(req.body, { contentType: req.headers['content-type'], resumable: false });
      await withTx(req.user.email, (c) => w.setExpensePhoto(c, id, path));
      return res.json({ ok: true, photoPath: path });
    } catch (error) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  },
);
router.get('/expenses/:id/photo', requireRole('viewer'), async (req, res, next) => {
  try {
    const id = need(idOf(req.params.id), 'Expense');
    const path = await withTx(req.user.email, (c) => w.expensePhotoPath(c, id));
    if (!path) return res.status(404).json({ error: 'No photo for this expense.' });
    const file = bucket().file(path);
    const [meta] = await file.getMetadata();
    res.set({ 'Content-Type': meta.contentType || 'application/octet-stream', 'Cache-Control': 'private, max-age=300' });
    return file.createReadStream().on('error', next).pipe(res);
  } catch (error) {
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});

export default router;
