import { apiUrl, hasBackend } from './api.js';

// The site's own visitor tracking, for the admin (/admin). It runs for every
// visitor (lib/analytics.js starts it; there is no opt-out on the site), and
// records how the site is used: pages, time on
// each, how far down people scroll, where they click (for heatmaps) and
// actions such as a call or WhatsApp tap. It never reads what anyone types.
//
// Events are queued and sent every few seconds, and when the page is hidden
// or closed, to POST /api/track (backend routes/track.js).
//
// Each device has a lasting ID. The server keeps it in a cookie of the site's
// own (__session, about 13 months); the copy here in localStorage is a backup,
// and is brought into line with the cookie whenever the server answers.

const VISITOR_KEY = 'cholan-vid';
const SESSION_KEY = 'cholan-session';
const SESSION_IDLE_MS = 2 * 60_000;
const FLUSH_MS = 5000;
// The shop's own tools, not part of the site's visits.
const INTERNAL = /^\/(dashboard|admin|warehouse)(\/|$)/;

// On the live site, the tracking route is reached through the site's own
// address (firebase.json sends /api/track on to the backend), so the device's
// cookie belongs to the site. Elsewhere (a local copy), straight to the backend.
const sameSite = typeof location !== 'undefined' && /(^|\.)cholanrice\.in$|^cholan-rice-site\.(web\.app|firebaseapp\.com)$/.test(location.hostname);
const trackUrl = (path = '') => (sameSite ? `/api/track${path}` : `${apiUrl}/api/track${path}`);

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
  // The admin and warehouse are the shop's own tools, not part of the site's visits.
  if (!running || INTERNAL.test(location.pathname)) return;
  queue.push({ t: Date.now(), path: location.pathname, ...event });
  touch();
  if (queue.length >= 40) flush();
}

function flush(closing = false) {
  // Nothing to send. A visit also starts only with something done on the
  // site itself: the admin and warehouse queue nothing (push), so opening
  // them is not a visit.
  if (!running || !ids || !queue.length) return;
  const body = { sid: ids.sid, vid: ids.vid, events: queue.splice(0, 80) };
  if (!ids.metaSent) {
    body.meta = {
      // Came in through the admin, then onto the site: the visit starts there.
      landing: INTERNAL.test(context.landing) ? body.events[0].path : context.landing,
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
  const url = trackUrl();
  const text = JSON.stringify(body);
  if (closing && navigator.sendBeacon?.(url, new Blob([text], { type: 'text/plain' }))) return;
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: text, keepalive: closing })
    .then((response) => (response.ok ? response.json() : null))
    .then((answer) => {
      // The cookie's ID wins: keep this copy, and the rest of the visit, in step.
      if (answer?.vid && ids && answer.vid !== ids.vid && /^[a-z0-9-]{8,64}$/i.test(answer.vid)) {
        ids.vid = answer.vid;
        write(localStorage, VISITOR_KEY, answer.vid);
      }
    })
    .catch(() => {
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

// Back after a break: the tab shown again, the browser reopened on it, the
// phone unlocked, or the page restored from the browser's back/forward store.
// Away longer than SESSION_IDLE_MS (2 minutes): a new visit, starting on this
// page as if they had just arrived. Otherwise the same visit carries on.
function resume() {
  if (!running || !ids || Date.now() - (ids.lastAt || 0) <= SESSION_IDLE_MS) return false;
  ids = { vid: ids.vid, returning: true, sid: uid(), metaSent: false };
  // They came back to the site themselves: no referrer or campaign this time.
  Object.assign(context, { landing: location.pathname, referrer: '', utmSource: '', utmMedium: '', utmCampaign: '' });
  touch();
  page = null;
  notePage(location.pathname, document.title);
  flush();
  return true;
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    if (!resume() && page) page.shownAt = Date.now();
    return;
  }
  // Leaving: the break is timed from now.
  touch();
  if (!page) return;
  if (page.shownAt) page.visibleMs += Date.now() - page.shownAt;
  page.shownAt = 0;
  // Send what we have, with the time so far, in case the tab never returns.
  queue.push({ t: Date.now(), path: page.path, type: 'scroll', depth: page.depth });
  queue.push({ t: Date.now(), path: page.path, type: 'leave', ms: page.visibleMs });
  page.visibleMs = 0;
  flush(true);
}

// The page restored from the back/forward store (common on phones when the
// browser is reopened). Its page view was ended as it was put away.
function onPageShow(event) {
  if (!event.persisted || resume()) return;
  if (!page) notePage(location.pathname, document.title);
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
  window.addEventListener('pageshow', onPageShow);
  timer = setInterval(() => flush(), FLUSH_MS);
}

function onPageHide() {
  endPage();
  flush(true);
}

// Tracking turned off: count only that a visit happened, once per visit (per
// tab), with no ID, cookie or details (backend /api/track/anon).
const ANON_KEY = 'cholan-anon-visit';
export function countAnonymousVisit() {
  if (!hasBackend || typeof window === 'undefined' || /^\/(dashboard|admin|warehouse)(\/|$)/.test(location.pathname)) return;
  if (read(sessionStorage, ANON_KEY)) return;
  write(sessionStorage, ANON_KEY, '1');
  fetch(trackUrl('/anon'), { method: 'POST', keepalive: true }).catch(() => {});
}
// Turned off part-way through a visit: that visit is already counted.
export const markVisitCounted = () => write(sessionStorage, ANON_KEY, '1');

// Turned off in Cookie settings: stop, and forget the device's ids, the
// server's cookie included (only the server can remove it).
export function stopTracking() {
  if (hasBackend && typeof window !== 'undefined') {
    fetch(trackUrl('/forget'), { method: 'POST', keepalive: true }).catch(() => {});
  }
  try {
    localStorage.removeItem(VISITOR_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing stored to remove.
  }
  if (!running) return;
  running = false;
  queue = [];
  page = null;
  clearInterval(timer);
  document.removeEventListener('click', onClick, true);
  window.removeEventListener('scroll', onScroll);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
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
