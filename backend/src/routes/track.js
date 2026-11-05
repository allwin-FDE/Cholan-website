// POST /api/track — visitor activity from the website, for the dashboard.
//
// The site sends this only for visitors who accepted cookies (see the
// frontend's lib/tracker.js). Each request is a small batch: the visit's
// details once, then page views, clicks (with their position, for heatmaps),
// scroll depth, time on page and actions such as a call or WhatsApp click.
// No names, phone numbers or typed text arrive here.
//
// Stored as:
//   visits/{visitId}  — one per visit: where they came from, device, totals
//   activity/{auto}   — one per batch: the events themselves
// Both carry expireAt, so Firestore deletes them after the retention period.
import { Router } from 'express';
import express from 'express';
import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { collection, firestoreEnabled } from '../lib/firestore.js';
import { createRateLimit } from '../lib/rateLimit.js';
import { config } from '../config.js';

const router = Router();

const limit = createRateLimit({ windowMs: 60_000, max: 120, message: 'Too many requests.' });

const str = (value, max) => (typeof value === 'string' ? value.slice(0, max) : undefined);
const num = (value) => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : undefined);
const ID = /^[a-z0-9-]{8,64}$/i;

// Where a visit came from, in the words the dashboard shows.
function sourceOf(meta) {
  if (meta.utmSource) return { source: meta.utmSource, medium: meta.utmMedium || 'campaign' };
  let host = '';
  try {
    host = new URL(meta.referrer).hostname.replace(/^www\./, '');
  } catch {
    return { source: 'Direct', medium: 'none' };
  }
  if (!host || /cholanrice\.in$|web\.app$|firebaseapp\.com$|localhost/.test(host)) return { source: 'Direct', medium: 'none' };
  const known = [
    [/(^|\.)google\./, 'Google', 'search'],
    [/(^|\.)bing\.com$/, 'Bing', 'search'],
    [/duckduckgo\.com$/, 'DuckDuckGo', 'search'],
    [/yahoo\.com$/, 'Yahoo', 'search'],
    [/instagram\.com$/, 'Instagram', 'social'],
    [/facebook\.com$|fb\.me$/, 'Facebook', 'social'],
    [/whatsapp\.com$|wa\.me$/, 'WhatsApp', 'social'],
    [/youtube\.com$|youtu\.be$/, 'YouTube', 'social'],
    [/linkedin\.com$|lnkd\.in$/, 'LinkedIn', 'social'],
    [/t\.co$|twitter\.com$|x\.com$/, 'X (Twitter)', 'social'],
    [/chatgpt\.com$|openai\.com$/, 'ChatGPT', 'ai'],
    [/perplexity\.ai$/, 'Perplexity', 'ai'],
    [/gemini\.google\.com$/, 'Gemini', 'ai'],
    [/justdial\.com$/, 'JustDial', 'directory'],
    [/indiamart\.com$/, 'IndiaMART', 'directory'],
  ];
  for (const [pattern, name, medium] of known) if (pattern.test(host)) return { source: name, medium };
  return { source: host, medium: 'referral' };
}

function deviceOf(ua = '') {
  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop';
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iOS/i.test(ua)
      ? 'iOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Other';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Other';
  return { device, os, browser };
}

const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed/i;

function cleanEvent(e) {
  if (!e || typeof e !== 'object') return null;
  const type = str(e.type, 12);
  if (!['pageview', 'click', 'scroll', 'leave', 'event'].includes(type)) return null;
  const event = { type, t: Number.isFinite(e.t) ? Math.round(e.t) : Date.now(), path: str(e.path, 200) || '/' };
  if (type === 'pageview') event.title = str(e.title, 160);
  if (type === 'click') {
    Object.assign(event, {
      x: num(e.x), // fraction of the page width, 0–1
      y: num(e.y), // pixels from the top of the page
      vw: num(e.vw),
      dh: num(e.dh),
      tag: str(e.tag, 12),
      label: str(e.label, 80),
      href: str(e.href, 200),
    });
  }
  if (type === 'scroll') event.depth = num(e.depth); // 0–100
  if (type === 'leave') event.ms = num(e.ms);
  if (type === 'event') {
    event.name = str(e.name, 40);
    if (e.params && typeof e.params === 'object') {
      event.params = {};
      for (const [key, value] of Object.entries(e.params).slice(0, 8)) {
        if (['string', 'number', 'boolean'].includes(typeof value)) event.params[str(key, 30)] = typeof value === 'string' ? value.slice(0, 120) : value;
      }
    }
  }
  return event;
}

router.post('/', limit, express.text({ type: '*/*', limit: '64kb' }), async (req, res) => {
  // Sent as text/plain so the browser can send it while the page closes,
  // without a separate permission check first.
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Bad JSON.' });
  }
  if (!firestoreEnabled) return res.status(204).end();
  const ua = req.get('user-agent') || '';
  if (BOT.test(ua)) return res.status(204).end();

  const sid = str(body?.sid, 64);
  const vid = str(body?.vid, 64);
  if (!sid || !vid || !ID.test(sid) || !ID.test(vid)) return res.status(400).json({ error: 'Missing ids.' });
  const events = (Array.isArray(body.events) ? body.events.slice(0, 80) : []).map(cleanEvent).filter(Boolean);
  if (!events.length && !body.meta) return res.status(204).end();

  const now = new Date();
  const expireAt = Timestamp.fromMillis(now.getTime() + config.trackRetentionDays * 86_400_000);
  const visit = {
    vid,
    last: Timestamp.fromDate(now),
    expireAt,
    pageviews: FieldValue.increment(events.filter((e) => e.type === 'pageview').length),
    clicks: FieldValue.increment(events.filter((e) => e.type === 'click').length),
    actions: FieldValue.increment(events.filter((e) => e.type === 'event').length),
    activeMs: FieldValue.increment(events.filter((e) => e.type === 'leave').reduce((sum, e) => sum + (e.ms || 0), 0)),
  };
  const paths = [...new Set(events.filter((e) => e.type === 'pageview').map((e) => e.path))];
  if (paths.length) visit.pages = FieldValue.arrayUnion(...paths);
  const names = [...new Set(events.filter((e) => e.type === 'event' && e.name).map((e) => e.name))];
  if (names.length) visit.actionNames = FieldValue.arrayUnion(...names);

  // The visit's details, sent with its first batch.
  if (body.meta && typeof body.meta === 'object') {
    const m = body.meta;
    const meta = {
      landing: str(m.landing, 200),
      referrer: str(m.referrer, 300),
      utmSource: str(m.utmSource, 100),
      utmMedium: str(m.utmMedium, 100),
      utmCampaign: str(m.utmCampaign, 100),
    };
    Object.assign(visit, meta, sourceOf(meta), deviceOf(ua), {
      start: Timestamp.fromDate(now),
      screen: str(m.screen, 20),
      lang: str(m.lang, 20),
      // Older browsers still name India's zone by its old name.
      tz: str(m.tz, 50)?.replace('Asia/Calcutta', 'Asia/Kolkata'),
      returning: Boolean(m.returning),
    });
  }

  try {
    const batch = collection('visits').firestore.batch();
    batch.set(collection('visits').doc(sid), visit, { merge: true });
    if (events.length) {
      batch.set(collection('activity').doc(), {
        sid,
        vid,
        at: Timestamp.fromDate(now),
        events,
        expireAt,
      });
    }
    await batch.commit();
    return res.status(204).end();
  } catch (error) {
    console.error('[track] could not store activity:', error.message);
    return res.status(500).json({ error: 'Could not store.' });
  }
});

export default router;
