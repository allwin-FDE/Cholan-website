import { apiUrl, hasBackend } from './api.js';

// The site's own visitor tracking, for the dashboard (/dashboard). It runs
// only after the visitor accepts cookies (lib/analytics.js starts and stops
// it), and records how the site is used: pages, time on each, how far down
// people scroll, where they click (for heatmaps) and actions such as a call
// or WhatsApp tap. It never reads what anyone types.
//
// Events are queued and sent every few seconds, and when the page is hidden
// or closed, to POST /api/track (backend routes/track.js).

const VISITOR_KEY = 'cholan-vid';
const SESSION_KEY = 'cholan-session';
const SESSION_IDLE_MS = 30 * 60_000;
const FLUSH_MS = 5000;

// Where this visit started and how the visitor arrived. Kept for the whole
// visit even without consent (in memory only), because the enquiry form
// sends it with an enquiry: the page someone asked from is part of their
// question, not tracking.
const firstUrl = typeof location !== 'undefined' ? new URL(location.href) : null;
const context = {
  landing: firstUrl ? firstUrl.pathname : '/',
  referrer: typeof document !== 'undefined' ? document.referrer : '',
  utmSource: firstUrl?.searchParams.get('utm_source') || '',
  utmMedium: firstUrl?.searchParams.get('utm_medium') || '',
  utmCampaign: firstUrl?.searchParams.get('utm_campaign') || '',
  history: [],
};

let running = false;
let queue = [];
let timer = null;
let ids = null; // { vid, sid, returning, metaSent }
let page = null; // { path, shownAt, visibleMs, depth }

const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

const read = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};
const write = (storage, key, value) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage blocked: the visit is still counted, as a new visitor.
  }
};

function loadIds() {
  let vid = read(localStorage, VISITOR_KEY);
  const returning = Boolean(vid);
  if (!vid) {
    vid = uid();
    write(localStorage, VISITOR_KEY, vid);
  }
  let session = null;
  try {
    session = JSON.parse(read(sessionStorage, SESSION_KEY) || 'null');
  } catch {
    session = null;
  }
  // A new visit after half an hour without activity.
  if (!session || Date.now() - session.lastAt > SESSION_IDLE_MS) session = { sid: uid(), metaSent: false };
  session.lastAt = Date.now();
  write(sessionStorage, SESSION_KEY, JSON.stringify(session));
  return { vid, returning, ...session };
}

function touch() {
  if (!ids) return;
  ids.lastAt = Date.now();
  write(sessionStorage, SESSION_KEY, JSON.stringify({ sid: ids.sid, metaSent: ids.metaSent, lastAt: ids.lastAt }));
}

function push(event) {
  // The dashboard and posting page are the shop's own tools, not part of the site's visits.
  if (!running || /^\/(dashboard|admin|warehouse)(\/|$)/.test(location.pathname)) return;
  queue.push({ t: Date.now(), path: location.pathname, ...event });
  touch();
  if (queue.length >= 40) flush();
}

function flush(closing = false) {
  if (!running || !ids || (!queue.length && ids.metaSent)) return;
  const body = { sid: ids.sid, vid: ids.vid, events: queue.splice(0, 80) };
  if (!ids.metaSent) {
    body.meta = {
      landing: context.landing,
      referrer: context.referrer,
      utmSource: context.utmSource,
      utmMedium: context.utmMedium,
      utmCampaign: context.utmCampaign,
      screen: `${screen.width}x${screen.height}`,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      returning: ids.returning,
    };
    ids.metaSent = true;
    touch();
  }
  // Sent as text/plain, so no permission check goes ahead of it. As the page
  // closes, a beacon: the browser finishes sending it after the page is gone.
  const url = `${apiUrl}/api/track`;
  const text = JSON.stringify(body);
  if (closing && navigator.sendBeacon?.(url, new Blob([text], { type: 'text/plain' }))) return;
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text, keepalive: closing }).catch(() => {
    // Lost on a bad connection: a few events, not worth a retry queue.
  });
}

// ---- Pages: time visible and scroll depth ----
function scrollDepth() {
  const doc = document.documentElement;
  const seen = window.scrollY + window.innerHeight;
  return Math.min(100, Math.round((seen / Math.max(doc.scrollHeight, 1)) * 100));
}

function endPage() {
  if (!page) return;
  if (page.shownAt) page.visibleMs += Date.now() - page.shownAt;
  queue.push({ t: Date.now(), path: page.path, type: 'scroll', depth: page.depth });
  queue.push({ t: Date.now(), path: page.path, type: 'leave', ms: page.visibleMs });
  page = null;
}

function onScroll() {
  if (page) page.depth = Math.max(page.depth, scrollDepth());
}

function onVisibility() {
  if (!page) return;
  if (document.visibilityState === 'hidden') {
    if (page.shownAt) page.visibleMs += Date.now() - page.shownAt;
    page.shownAt = 0;
    // Send what we have, with the time so far, in case the tab never returns.
    queue.push({ t: Date.now(), path: page.path, type: 'scroll', depth: page.depth });
    queue.push({ t: Date.now(), path: page.path, type: 'leave', ms: page.visibleMs });
    page.visibleMs = 0;
    flush(true);
  } else {
    page.shownAt = Date.now();
  }
}

// ---- Clicks, for heatmaps ----
const INTERACTIVE = 'a, button, [role="button"], summary, label, input, select, textarea, [data-track]';

function labelOf(el) {
  if (!el) return '';
  if (el.dataset?.track) return el.dataset.track;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    // Name the field, never its value.
    return `${el.tagName.toLowerCase()}: ${el.getAttribute('aria-label') || el.name || el.id || el.type || ''}`.trim();
  }
  const text = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('alt') || el.title || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 80);
}

function onClick(e) {
  const doc = document.documentElement;
  const target = e.target instanceof Element ? e.target : null;
  const el = target?.closest(INTERACTIVE) || target;
  push({
    type: 'click',
    x: Math.round((e.clientX / window.innerWidth) * 1000) / 1000,
    y: Math.round(e.pageY),
    vw: window.innerWidth,
    dh: doc.scrollHeight,
    tag: el?.tagName?.toLowerCase(),
    label: labelOf(el),
    href: el?.closest?.('a')?.getAttribute('href') || undefined,
  });
}

// ---- Start, stop and record ----
export function startTracking() {
  if (running || !hasBackend || typeof window === 'undefined') return;
  running = true;
  ids = loadIds();
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  timer = setInterval(() => flush(), FLUSH_MS);
}

function onPageHide() {
  endPage();
  flush(true);
}

// On withdrawal: stop, and forget the visitor's ids.
export function stopTracking() {
  if (!running) return;
  running = false;
  queue = [];
  page = null;
  clearInterval(timer);
  document.removeEventListener('click', onClick, true);
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  try {
    localStorage.removeItem(VISITOR_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored to remove.
  }
  ids = null;
}

// Every route change, consent or not, updates the visit context; with
// consent it also records the page view.
export function notePage(path, title) {
  if (context.history[context.history.length - 1] !== path) context.history.push(path);
  if (!running) return;
  // Already on this page (a repeated call for the same view): not a new view.
  if (page?.path === path && Date.now() - page.startedAt < 1500) return;
  endPage();
  page = { path, startedAt: Date.now(), shownAt: document.visibilityState === 'visible' ? Date.now() : 0, visibleMs: 0, depth: 0 };
  push({ type: 'pageview', title });
  // The new page's height settles after it renders.
  setTimeout(onScroll, 1200);
}

export function trackEvent(name, params) {
  push({ type: 'event', name, params });
}

// Sent with an enquiry: where on the site it came from.
export function enquiryContext() {
  const pages = context.history.filter((p) => p !== '/contact');
  return {
    page: pages[pages.length - 1] || context.landing,
    landing: context.landing,
    referrer: context.referrer || undefined,
    utmSource: context.utmSource || undefined,
    utmMedium: context.utmMedium || undefined,
    utmCampaign: context.utmCampaign || undefined,
    sessionId: running && ids ? ids.sid : undefined,
  };
}
