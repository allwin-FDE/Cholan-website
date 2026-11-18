// /api/admin/business: the Business screens in /admin (products and packs,
// customers and suppliers, price lists), on the business database.
// Anyone with admin access can look; only Admin and Owner can change things,
// including prices and credit limits. Every change is recorded with the
// signed-in person's email (see core.audit_log).
import { Router } from 'express';
import { requireRole } from '../lib/auth.js';
import { dbEnabled, withTx } from '../db/pool.js';
import {
  endPrice,
  friendly,
  getParty,
  listItems,
  listParties,
  listPriceLists,
  priceList,
  saveAddress,
  saveContact,
  saveParty,
  setPrice,
  updateItem,
} from '../lib/business.js';

const router = Router();
const id = (value) => (/^\d{1,12}$/.test(String(value)) ? Number(value) : null);

router.use((req, res, next) =>
  dbEnabled() ? next() : res.status(503).json({ error: 'The business database is not connected yet.', code: 'no-database' }),
);

// Runs one request in a transaction as the signed-in person; a database
// refusal comes back as a plain message for the screen.
const handle = (minRole, fn) => [
  requireRole(minRole),
  async (req, res, next) => {
    try {
      const result = await withTx(req.user.email, (client) => fn(client, req));
      res.json(result ?? { ok: true });
    } catch (error) {
      const e = friendly(error);
      if (e.status && e.status < 500) return res.status(e.status).json({ error: e.message, fields: e.fields || undefined });
      next(e);
    }
  },
];
const need = (value, what) => {
  if (value == null) throw Object.assign(new Error(`${what} not found.`), { status: 404 });
  return value;
};

router.get('/items', ...handle('viewer', async (c) => ({ items: await listItems(c) })));
router.patch('/items/:id', ...handle('admin', async (c, req) => ({ item: await updateItem(c, need(id(req.params.id), 'Item'), req.body || {}) })));

router.get('/price-lists', ...handle('viewer', async (c) => ({ lists: await listPriceLists(c), items: await listItems(c) })));
router.get('/price-lists/:id', ...handle('viewer', (c, req) => priceList(c, need(id(req.params.id), 'Price list'))));
router.post(
  '/price-lists/:id/prices',
  ...handle('admin', async (c, req) => {
    const listId = need(id(req.params.id), 'Price list');
    await setPrice(c, 'list', listId, req.body || {});
    return priceList(c, listId);
  }),
);
router.post(
  '/price-lists/:id/prices/:priceId/end',
  ...handle('admin', async (c, req) => {
    const listId = need(id(req.params.id), 'Price list');
    await endPrice(c, 'list', listId, need(id(req.params.priceId), 'Price'), req.body || {});
    return priceList(c, listId);
  }),
);

router.get('/parties', ...handle('viewer', async (c, req) => ({ parties: await listParties(c, { type: ['customer', 'supplier'].includes(req.query.type) ? req.query.type : 'all', q: req.query.q || '' }) })));
router.get('/parties/:id', ...handle('viewer', (c, req) => getParty(c, need(id(req.params.id), 'Customer or supplier'))));
router.post('/parties', ...handle('admin', (c, req) => saveParty(c, null, req.body || {})));
router.put('/parties/:id', ...handle('admin', (c, req) => saveParty(c, need(id(req.params.id), 'Customer or supplier'), req.body || {})));

const partyRoute = (path, fn) =>
  router.post(
    `/parties/:id${path}`,
    ...handle('admin', async (c, req) => {
      const partyId = need(id(req.params.id), 'Customer or supplier');
      await fn(c, partyId, req);
      return getParty(c, partyId);
    }),
  );
partyRoute('/addresses', (c, partyId, req) => saveAddress(c, partyId, null, req.body || {}));
partyRoute('/addresses/:addressId', (c, partyId, req) => saveAddress(c, partyId, need(id(req.params.addressId), 'Address'), req.body || {}));
partyRoute('/contacts', (c, partyId, req) => saveContact(c, partyId, null, req.body || {}));
partyRoute('/contacts/:contactId', (c, partyId, req) => saveContact(c, partyId, need(id(req.params.contactId), 'Contact'), req.body || {}));
partyRoute('/prices', (c, partyId, req) => setPrice(c, 'customer', partyId, req.body || {}));
partyRoute('/prices/:priceId/end', (c, partyId, req) => endPrice(c, 'customer', partyId, need(id(req.params.priceId), 'Price'), req.body || {}));

export default router;
