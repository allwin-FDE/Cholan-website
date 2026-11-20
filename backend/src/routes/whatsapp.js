// The /whatsapp dashboard's API (WhatsApp Cloud API by Meta).
//
//   /api/admin/whatsapp/*      signed-in staff with the WhatsApp app (Settings):
//                              viewer looks; editor makes templates, contacts and
//                              campaigns, replies in the inbox; admin deletes
//                              templates and contacts and changes the settings.
//   /api/whatsapp/webhook      Meta's notifications: messages in, delivery
//                              status, template approvals (signed with the app secret).
//   /api/jobs/whatsapp-tick    sends what is queued and starts scheduled
//                              campaigns; Cloud Scheduler, every minute (ADMIN_TOKEN).
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import express from 'express';
import { Storage } from '@google-cloud/storage';
import { config } from '../config.js';
import { requireRole } from '../lib/auth.js';
import { requireAdmin } from '../lib/requireAdmin.js';
import { firestore } from '../lib/firestore.js';
import { dbEnabled, query } from '../db/pool.js';
import { connection, graph } from '../lib/whatsapp/graph.js';
import { CATEGORIES, LANGUAGES } from '../lib/whatsapp/templates.js';
import { contactsFromRows, parseCsv, readNotification, signatureOk, waNumber } from '../lib/whatsapp/messages.js';
import * as wa from '../lib/whatsapp/service.js';

export const whatsappAdmin = Router();
export const whatsappWebhook = Router();
export const whatsappJobs = Router();

const run = (role, fn) => [
  requireRole(role),
  async (req, res, next) => {
    try {
      res.json(await fn(req, res));
    } catch (error) {
      if (error.status && error.status < 500) return res.status(error.status).json({ error: error.message, fields: error.fields || undefined, code: error.code || undefined });
      if (error.code === 'not-connected') return res.status(503).json({ error: error.message, code: 'not-connected' });
      return next(error);
    }
  },
];
const body = (req) => req.body || {};
// Signed in first, then the body read (an upload or a large import), then the work.
const runWith = (role, parse, fn) => {
  const [auth, work] = run(role, fn);
  return [auth, parse, work];
};

// ---- Status and settings ----
whatsappAdmin.get(
  '/status',
  ...run('viewer', async (req) => {
    const conn = connection();
    let phone = null;
    let phoneError = '';
    if (conn.ready) {
      try {
        phone = await graph().phone();
      } catch (e) {
        phoneError = e.message;
      }
    }
    const host = `${req.protocol}://${req.get('host')}`;
    return {
      connection: conn,
      phone,
      phoneError,
      webhookUrl: `${host}/api/whatsapp/webhook`,
      verifyTokenSet: Boolean(config.whatsapp.verifyToken),
      settings: await wa.getSettings(),
      categories: CATEGORIES,
      languages: LANGUAGES,
      triggers: wa.TRIGGERS,
    };
  }),
);
whatsappAdmin.put('/settings', ...run('admin', (req) => wa.saveSettings(body(req), req.user.email)));
whatsappAdmin.post('/test', ...run('editor', (req) => wa.sendTest(graph(), body(req), req.user.email)));
whatsappAdmin.get('/overview', ...run('viewer', (req) => wa.overview(Math.min(Math.max(Number(req.query.days) || 30, 1), 365))));

// ---- Templates ----
whatsappAdmin.get('/templates', ...run('viewer', async () => ({ templates: await wa.listTemplates() })));
whatsappAdmin.post('/templates/sync', ...run('editor', async () => ({ templates: await wa.syncTemplates(graph()) })));
whatsappAdmin.post('/templates', ...run('editor', (req) => wa.createTemplate(graph(), body(req), req.user.email)));
whatsappAdmin.delete('/templates/:name', ...run('admin', async (req) => (await wa.deleteTemplate(graph(), req.params.name, String(req.query.language || 'en')), { ok: true })));

// Files: a sample for a template's media header goes to Meta (it wants a
// handle); a file to send goes to our media bucket (Meta fetches it by link).
const SAMPLE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
const raw = express.raw({ type: Object.keys(SAMPLE_TYPES), limit: '16mb' });
whatsappAdmin.post(
  '/templates/sample',
  ...runWith('editor', raw, async (req) => {
    if (!SAMPLE_TYPES[req.get('content-type')] || !req.body?.length) throw Object.assign(new Error('Upload a JPG or PNG image, an MP4 video or a PDF.'), { status: 400 });
    if (!connection().canUploadMedia) throw Object.assign(new Error('Set the Meta app ID (WHATSAPP_APP_ID) to upload a sample.'), { status: 400 });
    return { handle: await graph().uploadSample(req.body, req.get('content-type')) };
  }),
);
const bucket = () => new Storage().bucket(config.mediaBucket);
whatsappAdmin.post(
  '/media',
  ...runWith('editor', raw, async (req) => {
    const type = req.get('content-type');
    if (!SAMPLE_TYPES[type] || !req.body?.length) throw Object.assign(new Error('Upload a JPG or PNG image, an MP4 video or a PDF.'), { status: 400 });
    const name = `${config.firestore.prefix}whatsapp/${Date.now()}-${randomUUID().slice(0, 8)}.${SAMPLE_TYPES[type]}`;
    await bucket().file(name).save(req.body, { contentType: type, metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { uploadedBy: req.user.email } } });
    return { name, url: `${req.protocol}://${req.get('host')}/api/media/${name}`, size: req.body.length };
  }),
);

// ---- Contacts ----
whatsappAdmin.get('/contacts', ...run('viewer', async () => ({ contacts: await wa.listContacts() })));
whatsappAdmin.post('/contacts', ...run('editor', (req) => wa.saveContact(body(req), { source: 'added', by: req.user.email })));
whatsappAdmin.put('/contacts/:wa', ...run('editor', (req) => wa.saveContact({ ...body(req), wa: req.params.wa }, { by: req.user.email })));
whatsappAdmin.delete('/contacts/:wa', ...run('admin', async (req) => (await wa.deleteContact(req.params.wa), { ok: true })));
whatsappAdmin.post('/contacts/bulk', ...run('editor', (req) => {
  if (body(req).delete && !['admin', 'owner'].includes(req.user.role)) throw Object.assign(new Error('Deleting contacts needs Admin access.'), { status: 403 });
  return wa.bulkContacts(body(req));
}));
whatsappAdmin.post(
  '/contacts/import',
  ...runWith('editor', express.json({ limit: '4mb' }), async (req) => {
    const rows = parseCsv(body(req).csv);
    if (!rows.length) throw Object.assign(new Error('The file is empty, or has no header row (phone, name, tags…).'), { status: 400 });
    const { contacts, bad } = contactsFromRows(rows, { tags: String(body(req).tags || '').split(',') });
    const done = await wa.importContacts(contacts, { source: 'import', consent: Boolean(body(req).consent), by: req.user.email });
    return { ...done, bad: bad.slice(0, 50), badCount: bad.length };
  }),
);
// Website enquiries (Firestore): everyone who left a phone number.
whatsappAdmin.post(
  '/contacts/import-enquiries',
  ...run('editor', async (req) => {
    const db = firestore();
    if (!db) throw Object.assign(new Error('The enquiries database is not configured.'), { status: 503 });
    const snap = await db.collection(config.firestore.collection).limit(5000).get();
    const list = snap.docs
      .map((d) => d.data())
      .map((e) => ({ wa: waNumber(e.phone), name: String(e.name || '').slice(0, 80), tags: ['enquiry', ...(body(req).tags ? String(body(req).tags).split(',') : [])], attributes: e.product ? { product: String(e.product) } : {} }))
      .filter((c) => c.wa);
    return wa.importContacts(list, { source: 'enquiry', consent: Boolean(body(req).consent), by: req.user.email });
  }),
);
// Customers from the business database (Cloud SQL), tagged by their segment.
whatsappAdmin.post(
  '/contacts/import-customers',
  ...run('editor', async (req) => {
    if (!dbEnabled()) throw Object.assign(new Error('The business database is not connected.'), { status: 503 });
    const { rows } = await query(
      `SELECT p.display_name, p.phone, cp.segment, (SELECT a.city FROM party.addresses a WHERE a.party_id = p.id AND a.active ORDER BY a.is_default DESC, a.id LIMIT 1) AS city
       FROM party.parties p LEFT JOIN party.customer_profiles cp ON cp.party_id = p.id
       WHERE p.is_customer AND p.active AND p.phone IS NOT NULL`,
    );
    const list = rows
      .map((r) => ({ wa: waNumber(r.phone), name: r.display_name, tags: ['customer', r.segment ? `segment-${r.segment}` : null].filter(Boolean), attributes: r.city ? { city: r.city } : {} }))
      .filter((c) => c.wa);
    return wa.importContacts(list, { source: 'customer', consent: Boolean(body(req).consent), by: req.user.email });
  }),
);

// ---- Campaigns ----
whatsappAdmin.get('/campaigns', ...run('viewer', async () => ({ campaigns: await wa.listCampaigns() })));
whatsappAdmin.get('/campaigns/:id', ...run('viewer', (req) => wa.getCampaign(req.params.id)));
whatsappAdmin.post('/campaigns/preview', ...run('editor', (req) => wa.previewCampaign(body(req))));
whatsappAdmin.post(
  '/campaigns',
  ...run('editor', async (req) => {
    const made = await wa.createCampaign(body(req), req.user.email);
    // A small campaign sent now goes straight away; larger ones carry on with the tick.
    if (made.status === 'sending') await wa.tick(graph(), { limit: 60 }).catch((e) => console.error('[whatsapp] first send:', e.message));
    return wa.getCampaign(made.id);
  }),
);
whatsappAdmin.post(
  '/campaigns/:id/launch',
  ...run('editor', async (req) => {
    await wa.launchCampaign(req.params.id, req.user.email);
    await wa.tick(graph(), { limit: 60 }).catch((e) => console.error('[whatsapp] first send:', e.message));
    return wa.getCampaign(req.params.id);
  }),
);
whatsappAdmin.post('/campaigns/:id/schedule', ...run('editor', (req) => wa.scheduleCampaign(req.params.id, body(req).scheduleAt)));
for (const action of ['pause', 'resume', 'cancel', 'unschedule']) {
  whatsappAdmin.post(`/campaigns/:id/${action}`, ...run('editor', (req) => wa.setCampaignState(req.params.id, action)));
}

// ---- Inbox ----
whatsappAdmin.get('/inbox', ...run('viewer', async () => ({ conversations: await wa.conversations() })));
whatsappAdmin.get('/inbox/:wa', ...run('viewer', (req) => wa.conversation(req.params.wa)));
whatsappAdmin.post('/inbox/:wa/read', ...run('editor', async (req) => (await wa.markRead(graph(), req.params.wa), { ok: true })));
whatsappAdmin.post('/inbox/:wa/reply', ...run('editor', (req) => wa.reply(graph(), req.params.wa, body(req), req.user.email)));

// ---- Automations ----
whatsappAdmin.get('/automations', ...run('viewer', async () => ({ automations: await wa.listAutomations() })));
whatsappAdmin.post('/automations', ...run('editor', (req) => wa.saveAutomation(null, body(req), req.user.email)));
whatsappAdmin.put('/automations/:id', ...run('editor', (req) => wa.saveAutomation(req.params.id, body(req), req.user.email)));
whatsappAdmin.delete('/automations/:id', ...run('editor', async (req) => (await wa.deleteAutomation(req.params.id), { ok: true })));

// ---- Meta's webhook ----
// Meta checks the address once with the verify token.
whatsappWebhook.get('/', (req, res) => {
  const ok = req.query['hub.mode'] === 'subscribe' && config.whatsapp.verifyToken && req.query['hub.verify_token'] === config.whatsapp.verifyToken;
  return ok ? res.type('text/plain').send(String(req.query['hub.challenge'] || '')) : res.sendStatus(403);
});
// Meta signs the exact bytes, so the body is read raw.
whatsappWebhook.post('/', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!config.whatsapp.fake && !signatureOk(text, req.get('x-hub-signature-256'), config.whatsapp.appSecret)) return res.sendStatus(401);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return res.sendStatus(400);
  }
  try {
    await wa.handleNotification(graph(), readNotification(payload));
    // Order and keyword replies were queued: send them now, not at the next tick.
    await wa.tick(graph(), { limit: 20 }).catch(() => {});
    return res.sendStatus(200);
  } catch (error) {
    // Meta retries on anything but 200, so a short outage loses nothing.
    console.error('[whatsapp] webhook failed:', error.message);
    return res.sendStatus(500);
  }
});

// ---- The tick ----
whatsappJobs.post('/whatsapp-tick', requireAdmin, async (req, res, next) => {
  try {
    if (!connection().ready) return res.json({ skipped: 'not connected' });
    return res.json(await wa.tick(graph()));
  } catch (error) {
    return next(error);
  }
});
