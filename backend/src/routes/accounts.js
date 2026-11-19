// /api/admin/accounts: Phase 5 (GSTR-1 and GSTR-3B helpers, Tally export,
// payment reminders, reports) and the staff side of Phase 4 (online orders,
// refunds, switching online payment on or off).
//
// Viewer: look and download. Editor: log reminders. Admin and Owner: Tally
// ledgers, exports and voiding them, refunds, switching online payment.
import { Router } from 'express';
import { handle, idOf, need, needDb } from './handle.js';
import * as a from '../lib/accounts.js';
import { onlineOrders, onlineStatus, razorpayApi, razorpayKeys, refundOrder, setOnline } from '../lib/online.js';
import { requireRole } from '../lib/auth.js';
import { withTx } from '../db/pool.js';

const router = Router();
router.use(needDb);
const body = (req) => req.body || {};

// GST helpers
router.get('/gstr1', ...handle('viewer', (c, req) => a.gstr1(c, String(req.query.month || ''))));
router.get('/gstr3b', ...handle('viewer', (c, req) => a.gstr3b(c, String(req.query.month || ''))));

// Reports
router.get('/report', ...handle('viewer', (c, req) => a.businessReport(c, { from: req.query.from, to: req.query.to })));

// Tally
router.get('/tally/ledgers', ...handle('viewer', async (c) => ({ ledgers: await a.listLedgers(c) })));
router.put('/tally/ledgers/:key', ...handle('admin', async (c, req) => (await a.setLedger(c, String(req.params.key), body(req)), { ledgers: await a.listLedgers(c) })));
router.get('/tally/exports', ...handle('viewer', async (c) => ({ exports: await a.listExports(c) })));
router.post('/tally/exports', ...handle('admin', async (c, req) => ({ id: await a.exportToTally(c, body(req)), exports: await a.listExports(c) })));
router.post('/tally/exports/:id/void', ...handle('admin', async (c, req) => (await a.voidExport(c, need(idOf(req.params.id), 'Export'), body(req)), { exports: await a.listExports(c) })));
const sendXml = (res, filename, xml) => {
  res.set({ 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' });
  res.send(xml);
};
router.get('/tally/exports/:id/xml', requireRole('viewer'), async (req, res, next) => {
  try {
    const b = await withTx(req.user.email, (c) => a.exportXml(c, need(idOf(req.params.id), 'Export')));
    sendXml(res, `cholan-tally-${b.from_date}-to-${b.to_date}-${b.id}.xml`, b.xml);
  } catch (error) {
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
});
router.get('/tally/party-ledgers.xml', requireRole('viewer'), async (req, res, next) => {
  try {
    sendXml(res, 'cholan-tally-party-ledgers.xml', await withTx(req.user.email, (c) => a.partyMastersXml(c)));
  } catch (error) {
    next(error);
  }
});

// Payment reminders
router.get('/reminders', ...handle('viewer', async (c) => ({ customers: await a.overdueCustomers(c) })));
router.get('/reminders/:partyId', ...handle('viewer', async (c, req) => {
  const partyId = need(idOf(req.params.partyId), 'Customer');
  return { ...(await a.reminderText(c, partyId)), history: await a.remindersFor(c, partyId) };
}));
router.post('/reminders/:partyId', ...handle('editor', async (c, req) => (await a.logReminder(c, need(idOf(req.params.partyId), 'Customer'), body(req)), { customers: await a.overdueCustomers(c) })));

// Online payments (Phase 4), the staff side
router.get('/online', ...handle('viewer', async (c) => ({ status: await onlineStatus(c), orders: await onlineOrders(c) })));
router.post(
  '/online/switch',
  ...handle('admin', async (c, req) => {
    const on = body(req).on === true;
    const keys = razorpayKeys();
    if (on && !keys.ready) throw Object.assign(new Error('Add the Razorpay keys to the server first (Secret Manager).'), { status: 400 });
    await setOnline(c, on);
    return { status: await onlineStatus(c) };
  }),
);
router.post('/online/orders/:id/refund', ...handle('admin', async (c, req) => ({ refundId: await refundOrder(c, need(idOf(req.params.id), 'Order'), body(req), { rp: razorpayApi() }) })));

export default router;
