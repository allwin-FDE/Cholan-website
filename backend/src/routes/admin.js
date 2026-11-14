// /api/admin/* — everything behind the /admin sign-in. Each route states
// the least role it needs (lib/auth.js).
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import express from 'express';
import { Storage } from '@google-cloud/storage';
import { config } from '../config.js';
import { ROLES, WAREHOUSE_ROLES, requireRole, accessCollection } from '../lib/auth.js';
import { collection, firestore } from '../lib/firestore.js';
import { loadPeriod, overview, pageStats, visitSummary, journey, heatmap } from '../lib/insights.js';
import { cleanPost, cleanShortPost, postsCollection, uniqueSlug } from '../lib/posts.js';
import { clearPostCache } from './posts.js';
import { commentsCollection } from './comments.js';

const router = Router();
const days = (req) => Math.min(Math.max(Number(req.query.days) || 30, 1), 400);
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// ---- Who am I ----
router.get('/me', requireRole('viewer'), (req, res) => res.json(req.user));

// ---- Reports ----
router.get(
  '/overview',
  requireRole('viewer'),
  wrap(async (req, res) => res.json(overview(await loadPeriod(days(req))))),
);

router.get(
  '/pages',
  requireRole('viewer'),
  wrap(async (req, res) => res.json({ pages: pageStats(await loadPeriod(days(req))) })),
);

router.get(
  '/visits',
  requireRole('viewer'),
  wrap(async (req, res) => {
    const period = await loadPeriod(days(req));
    const q = String(req.query.q || '').toLowerCase();
    let list = period.visits.map(visitSummary);
    if (req.query.device) list = list.filter((v) => v.device === req.query.device);
    if (req.query.source) list = list.filter((v) => v.source === req.query.source);
    if (req.query.action) list = list.filter((v) => v.actionNames.includes(req.query.action));
    if (q) list = list.filter((v) => [v.source, v.landing, v.referrer, v.campaign, ...v.pages].join(' ').toLowerCase().includes(q));
    res.json({ total: list.length, visits: list.slice(0, Math.min(Number(req.query.limit) || 200, 1000)) });
  }),
);

router.get(
  '/visits/:id',
  requireRole('viewer'),
  wrap(async (req, res) => {
    const found = journey(req.params.id, await loadPeriod(400));
    if (!found) return res.status(404).json({ error: 'That visit was not found.' });
    return res.json(found);
  }),
);

// Every visit from one device (its lasting ID, routes/track.js), oldest first.
router.get(
  '/visitors/:vid',
  requireRole('viewer'),
  wrap(async (req, res) => {
    const vid = String(req.params.vid || '');
    const visits = (await loadPeriod(400)).visits
      .filter((v) => v.vid === vid)
      .map(visitSummary)
      .sort((a, b) => a.start - b.start);
    if (!visits.length) return res.status(404).json({ error: 'No visits from that device.' });
    return res.json({ vid, firstSeen: visits[0].start, lastSeen: visits[visits.length - 1].last, visitCount: visits.length, visits });
  }),
);

router.get(
  '/heatmap',
  requireRole('viewer'),
  wrap(async (req, res) => {
    const period = await loadPeriod(days(req));
    const path = String(req.query.path || '/');
    res.json(heatmap(path, req.query.device || '', period));
  }),
);

// ---- Enquiries ----
const enquiries = () => {
  const db = firestore();
  if (!db) throw Object.assign(new Error('The database is not configured.'), { status: 503 });
  return db.collection(config.firestore.collection);
};
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost', 'spam'];

router.get(
  '/enquiries',
  requireRole('editor'),
  wrap(async (req, res) => {
    const snap = await enquiries().orderBy('createdAt', 'desc').limit(Math.min(Number(req.query.limit) || 500, 2000)).get();
    res.json({
      statuses: STATUSES,
      enquiries: snap.docs.map((doc) => ({ id: doc.id, status: 'new', ...doc.data() })),
    });
  }),
);

router.patch(
  '/enquiries/:id',
  requireRole('editor'),
  wrap(async (req, res) => {
    const update = { updatedAt: new Date().toISOString(), updatedBy: req.user.email };
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Unknown status.' });
      update.status = req.body.status;
    }
    if (typeof req.body.note === 'string') update.note = req.body.note.slice(0, 2000);
    await enquiries().doc(req.params.id).set(update, { merge: true });
    return res.json({ ok: true, ...update });
  }),
);

router.delete(
  '/enquiries/:id',
  requireRole('admin'),
  wrap(async (req, res) => {
    await enquiries().doc(req.params.id).delete();
    res.json({ ok: true });
  }),
);

// ---- Newsletter subscribers (the footer's "Subscribe to Updates") ----
router.get(
  '/subscribers',
  requireRole('editor'),
  wrap(async (req, res) => {
    const snap = await collection('subscribers').orderBy('createdAt', 'desc').limit(5000).get();
    res.json({ subscribers: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  }),
);

// Editors can remove someone, so an unsubscribe request is honoured by
// whoever reads it.
router.delete(
  '/subscribers/:email',
  requireRole('editor'),
  wrap(async (req, res) => {
    await collection('subscribers').doc(String(req.params.email).toLowerCase()).delete();
    res.json({ ok: true });
  }),
);

// ---- Access (Settings) ----
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.get(
  '/access',
  requireRole('admin'),
  wrap(async (req, res) => {
    const snap = await accessCollection().get();
    res.json({
      roles: ROLES.filter((r) => r !== 'owner'),
      owners: config.ownerEmails,
      people: snap.docs
        .map((doc) => ({ email: doc.id, ...doc.data() }))
        .filter((person) => !WAREHOUSE_ROLES.includes(person.role))
        .sort((a, b) => a.email.localeCompare(b.email)),
    });
  }),
);

router.put(
  '/access/:email',
  requireRole('admin'),
  wrap(async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    const role = String(req.body.role || '');
    if (!EMAIL.test(email)) return res.status(400).json({ error: 'That email address does not look right.' });
    if (!['viewer', 'editor', 'admin'].includes(role)) return res.status(400).json({ error: 'Choose viewer, editor or admin.' });
    if (config.ownerEmails.includes(email)) return res.status(400).json({ error: 'That address is an owner and always has full access.' });
    const ref = accessCollection().doc(email);
    const existing = await ref.get();
    const entry = {
      role,
      note: typeof req.body.note === 'string' ? req.body.note.slice(0, 120) : existing.data()?.note || '',
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.email,
      ...(existing.exists ? {} : { addedAt: new Date().toISOString(), addedBy: req.user.email }),
    };
    await ref.set(entry, { merge: true });
    return res.json({ email, ...existing.data(), ...entry });
  }),
);

router.delete(
  '/access/:email',
  requireRole('admin'),
  wrap(async (req, res) => {
    const email = String(req.params.email || '').toLowerCase();
    if (email === req.user.email) return res.status(400).json({ error: 'You cannot remove your own access.' });
    await accessCollection().doc(email).delete();
    return res.json({ ok: true });
  }),
);

// ---- Blog ----
router.get(
  '/posts',
  requireRole('editor'),
  wrap(async (req, res) => {
    const snap = await postsCollection().get();
    const posts = snap.docs
      .map((doc) => {
        const { contentHtml: _html, ...rest } = doc.data();
        return { id: doc.id, ...rest };
      })
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    res.json({ posts });
  }),
);

router.get(
  '/posts/:id',
  requireRole('editor'),
  wrap(async (req, res) => {
    const doc = await postsCollection().doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Post not found.' });
    return res.json({ id: doc.id, ...doc.data() });
  }),
);

async function savePost(req, res, id) {
  const { value, errors } = cleanPost(req.body, backendOrigin(req));
  if (errors) return res.status(400).json({ error: 'Please check the post.', fields: errors });
  // Two posts cannot share a web address.
  const clash = await postsCollection().where('slug', '==', value.slug).get();
  if (clash.docs.some((doc) => doc.id !== id)) {
    return res.status(400).json({ error: 'Another post already uses this web address.', fields: { slug: 'Already used by another post.' } });
  }
  const ref = id ? postsCollection().doc(id) : postsCollection().doc();
  const existing = id ? await ref.get() : null;
  if (id && !existing.exists) return res.status(404).json({ error: 'Post not found.' });
  const now = new Date().toISOString();
  const post = {
    ...value,
    updatedAt: now,
    updatedBy: req.user.email,
    ...(existing?.exists ? {} : { createdAt: now, createdBy: req.user.email }),
  };
  await ref.set(post, { merge: true });
  clearPostCache();
  return res.status(id ? 200 : 201).json({ id: ref.id, ...existing?.data(), ...post });
}

router.post('/posts', requireRole('editor'), express.json({ limit: '2mb' }), wrap((req, res) => savePost(req, res, null)));
router.put('/posts/:id', requireRole('editor'), express.json({ limit: '2mb' }), wrap((req, res) => savePost(req, res, req.params.id)));

router.delete(
  '/posts/:id',
  requireRole('editor'),
  wrap(async (req, res) => {
    await postsCollection().doc(req.params.id).delete();
    // A post's comments go with it.
    const comments = await commentsCollection().where('postId', '==', req.params.id).get();
    await Promise.all(comments.docs.map((doc) => doc.ref.delete()));
    clearPostCache();
    res.json({ ok: true });
  }),
);

// ---- Blogs from the composer (/admin/blog/new): pictures and content ----
// Publish puts the blog live at once; Save draft keeps it off the website.
// Only the person's role, checked here, decides who may do either.
const backendOrigin = (req) => `${req.protocol}://${req.get('host')}`;
const allSlugs = async () => new Set((await postsCollection().get()).docs.map((doc) => doc.data().slug));

async function shortPost(req, res) {
  const ref = postsCollection().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists || doc.data().format !== 'post') {
    res.status(404).json({ error: 'Post not found.' });
    return null;
  }
  return { ref, doc };
}

router.post(
  '/short-posts',
  requireRole('editor'),
  express.json({ limit: '2mb' }),
  wrap(async (req, res) => {
    const draft = req.body?.draft === true;
    const { value, errors } = cleanShortPost({ ...req.body, postedBy: req.user.email }, backendOrigin(req), { draft });
    if (errors) return res.status(400).json({ error: 'Please check the post.', fields: errors });
    const now = new Date().toISOString();
    const ref = postsCollection().doc();
    const post = {
      ...value,
      // A draft gets its web address when it is published, from its final title.
      slug: draft ? '' : uniqueSlug(value.title, await allSlugs()),
      status: draft ? 'draft' : 'published',
      publishAt: draft ? null : now,
      createdAt: now,
      updatedAt: now,
      createdBy: req.user.email,
      updatedBy: req.user.email,
    };
    await ref.set(post);
    clearPostCache();
    return res.status(201).json({ id: ref.id, ...post });
  }),
);

router.put(
  '/short-posts/:id',
  requireRole('editor'),
  express.json({ limit: '2mb' }),
  wrap(async (req, res) => {
    const found = await shortPost(req, res);
    if (!found) return undefined;
    const existing = found.doc.data();
    const draft = req.body?.draft === true;
    const postedBy = existing.postedBy || req.user.email;
    const { value, errors } = cleanShortPost({ ...req.body, postedBy }, backendOrigin(req), { draft });
    if (errors) return res.status(400).json({ error: 'Please check the post.', fields: errors });
    const now = new Date().toISOString();
    const wasLive = existing.status === 'published' && existing.publishAt;
    const post = {
      ...existing,
      ...value,
      updatedAt: now,
      updatedBy: req.user.email,
      reviewNote: '',
      // A live blog keeps its date when it is corrected; saving it as a draft
      // takes it off the website.
      ...(draft
        ? { status: 'draft', publishAt: null }
        : {
            status: 'published',
            publishAt: wasLive ? existing.publishAt : now,
            slug: existing.slug || uniqueSlug(value.title, await allSlugs()),
          }),
    };
    await found.ref.set(post);
    clearPostCache();
    return res.json({ id: found.ref.id, ...post });
  }),
);

// How many comments are waiting, for the count on the Comments menu.
router.get(
  '/review-count',
  requireRole('editor'),
  wrap(async (req, res) => {
    const comments = await commentsCollection().where('status', '==', 'pending').count().get();
    res.json({ comments: comments.data().count });
  }),
);

// ---- Visitors' comments on the blog ----
router.get(
  '/comments',
  requireRole('editor'),
  wrap(async (req, res) => {
    const snap = await commentsCollection().get();
    res.json({
      comments: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  }),
);

router.patch(
  '/comments/:id',
  requireRole('editor'),
  wrap(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Unknown status.' });
    const update = { status, reviewedBy: req.user.email, reviewedAt: new Date().toISOString() };
    await commentsCollection().doc(req.params.id).set(update, { merge: true });
    return res.json({ ok: true, ...update });
  }),
);

router.delete(
  '/comments/:id',
  requireRole('editor'),
  wrap(async (req, res) => {
    await commentsCollection().doc(req.params.id).delete();
    res.json({ ok: true });
  }),
);

// ---- Images for the blog ----
// Uploaded to a private bucket and served by GET /api/media/* (routes/posts.js).
const storage = new Storage();
const bucket = () => storage.bucket(config.mediaBucket);
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const mediaUrl = (req, name) => `${req.protocol}://${req.get('host')}/api/media/${name}`;

router.post(
  '/media',
  requireRole('editor'),
  express.raw({ type: Object.keys(TYPES), limit: '10mb' }),
  wrap(async (req, res) => {
    const type = req.get('content-type');
    if (!TYPES[type] || !Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: 'Upload a JPG, PNG, WebP, GIF or AVIF image (up to 10 MB).' });
    }
    const name = `${config.firestore.prefix}blog/${Date.now()}-${randomUUID().slice(0, 8)}.${TYPES[type]}`;
    await bucket().file(name).save(req.body, {
      contentType: type,
      metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { uploadedBy: req.user.email } },
    });
    return res.status(201).json({ name, url: mediaUrl(req, name), size: req.body.length });
  }),
);

router.get(
  '/media',
  requireRole('editor'),
  wrap(async (req, res) => {
    const [files] = await bucket().getFiles({ prefix: `${config.firestore.prefix}blog/`, maxResults: 300 });
    res.json({
      media: files
        .map((f) => ({ name: f.name, url: mediaUrl(req, f.name), size: Number(f.metadata.size), at: f.metadata.timeCreated }))
        .sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    });
  }),
);

router.delete(
  '/media/*',
  requireRole('editor'),
  wrap(async (req, res) => {
    const name = req.params[0];
    if (!name.startsWith(`${config.firestore.prefix}blog/`)) return res.status(400).json({ error: 'Not a blog image.' });
    await bucket().file(name).delete({ ignoreNotFound: true });
    return res.json({ ok: true });
  }),
);

export default router;
