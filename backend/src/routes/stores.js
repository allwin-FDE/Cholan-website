// The store finder.
//
//   GET  /api/stores                   every open store (public: no manager names)
//   GET  /api/stores/:code             one store
//   POST /api/stores/nearest           { lat, lng, accuracy } or { q: pincode/place }
//                                      → nearest stores by road distance
//   GET  /api/admin/stores/usage       Google Maps use today against the limits
//   /api/admin/stores/*                website staff (Settings → Website app):
//                                      viewer looks; editor fixes addresses and
//                                      pins and places stores; admin imports sheets
//   POST /api/jobs/stores-refresh      fetches again Google pins older than Google
//                                      lets us keep (Cloud Scheduler, ADMIN_TOKEN)
import { Router } from 'express';
import express from 'express';
import { requireRole } from '../lib/auth.js';
import { requireAdmin } from '../lib/requireAdmin.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { firestoreEnabled } from '../config.js';
import { readXlsx } from '../lib/stores/xlsx.js';
import { csvRows } from '../lib/stores/sheet.js';
import { mapsConfigured } from '../lib/stores/geo.js';
import * as stores from '../lib/stores/service.js';

export const storesPublic = Router();
export const storesAdmin = Router();
export const storesJobs = Router();

const ready = (req, res, next) =>
  firestoreEnabled ? next() : res.status(503).json({ error: 'The store list is not available right now.' });

const run = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req, res));
  } catch (error) {
    if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, fields: error.fields || undefined });
    if (error.code === 'maps' && error.status === 429) return res.status(429).json({ error: req.baseUrl.includes('/admin/') ? error.message : 'The store search is busy right now. Please use “Find stores near me”, or try again later.' });
    if (error.code === 'maps') return res.status(502).json({ error: 'Google Maps didn’t answer. Please try again in a moment.' });
    return next(error);
  }
};
const guarded = (role, fn) => [requireRole(role), run(fn)];

// Searches cost a Google call each, so one visitor gets a fair number, not unlimited.
const searchLimit = createRateLimit({ windowMs: 10 * 60_000, max: 30, message: 'Too many searches. Please wait a few minutes and try again.' });

storesPublic.use(ready);
storesPublic.get(
  '/',
  run(async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    const list = await stores.publicStores();
    return { stores: list, count: list.length };
  }),
);
storesPublic.post(
  '/nearest',
  searchLimit,
  run(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const b = req.body || {};
    const limit = Math.min(30, Math.max(5, Number(b.limit) || 20));
    const from = b.from === 'popup' ? 'popup' : 'page';
    if (b.q) return stores.nearest({ q: String(b.q), limit, from });
    if (b.lat == null || b.lng == null) throw Object.assign(new Error('Share your location or type a pincode.'), { status: 400 });
    return stores.nearest({ lat: b.lat, lng: b.lng, accuracy: b.accuracy, limit, from });
  }),
);
storesPublic.get(
  '/:code',
  run(async (req) => {
    const s = (await stores.allStores()).find((x) => x.code === String(req.params.code).toUpperCase() && x.active !== false);
    if (!s) throw Object.assign(new Error('Store not found.'), { status: 404 });
    return { store: stores.publicStore(s) };
  }),
);

// ---- Staff ----

storesAdmin.use(ready);
storesAdmin.get(
  '/',
  ...guarded('viewer', async () => {
    const list = await stores.allStores();
    return { stores: list.map((s) => ({ ...s, address: stores.publicStore(s).address, directionsUrl: stores.directionsUrl(s) })), counts: stores.counts(list), mapsConfigured: mapsConfigured(), usage: await stores.usageToday().catch(() => null) };
  }),
);

// Google Maps use today against the daily limits (the bar on the Stores page).
storesAdmin.get(
  '/usage',
  ...guarded('viewer', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    return stores.usageReport();
  }),
);

// The sheet itself (.xlsx or .csv) as the body. ?commit=1 saves; without it
// the answer is a preview of what would change. ?hideMissing=1 hides stores
// the sheet leaves out (they are kept, not deleted).
storesAdmin.post(
  '/import',
  express.raw({ type: () => true, limit: '5mb' }),
  ...guarded('admin', async (req) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw Object.assign(new Error('Choose a file to upload.'), { status: 400 });
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
    let rows;
    if (isZip) rows = readXlsx(buf);
    else if (/text|csv/i.test(req.get('content-type') || '') || !buf.subarray(0, 512).includes(0)) rows = csvRows(buf.toString('utf8'));
    else throw Object.assign(new Error('Upload an Excel (.xlsx) or CSV file. Old .xls files: open in Excel and save as .xlsx.'), { status: 400 });
    return stores.importSheet(rows, { commit: req.query.commit === '1', hideMissing: req.query.hideMissing === '1', actor: req.user.email });
  }),
);

storesAdmin.post(
  '/locate',
  ...guarded('editor', async (req) => {
    if (!mapsConfigured()) throw Object.assign(new Error('Google Maps is not set up on the server yet.'), { status: 503 });
    const codes = Array.isArray(req.body?.codes) ? req.body.codes.map(String).slice(0, 50) : null;
    return stores.locateBatch({ codes, limit: Number(req.body?.limit) || 12, actor: req.user.email });
  }),
);

storesAdmin.patch(
  '/:code',
  ...guarded('editor', async (req) => {
    const store = await stores.updateStore(String(req.params.code).toUpperCase(), req.body || {}, req.user.email);
    return { store: { ...store, address: stores.publicStore(store).address, directionsUrl: stores.directionsUrl(store) } };
  }),
);

storesJobs.post(
  '/stores-refresh',
  requireAdmin,
  ready,
  run(async () => stores.refreshStale({ limit: 25 })),
);
