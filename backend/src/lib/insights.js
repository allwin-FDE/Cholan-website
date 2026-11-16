// Turns stored visitor activity (routes/track.js) into the dashboard's
// numbers. A period's visits and activity are read once and kept for a
// minute, so moving between dashboard pages does not re-read the database.
import { Timestamp } from '@google-cloud/firestore';
import { collection } from './firestore.js';

const CACHE_MS = 60_000;
const cache = new Map();
// After visits are deleted, so the reports stop showing them at once.
export const forgetPeriods = () => cache.clear();

const IST_OFFSET = 330 * 60_000;
// Day and hour in India time, whatever the server's clock.
const istDate = (ms) => new Date(ms + IST_OFFSET);
export const dayKey = (ms) => istDate(ms).toISOString().slice(0, 10);
const hourOf = (ms) => istDate(ms).getUTCHours();

const millis = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === 'number' ? ts : Date.parse(ts) || 0);

const DAY = 86_400_000;
const FILE = /\.[a-z0-9]{2,5}$/i;

// A period is a number of days back from now, or a range of whole days in
// India time: { from, to } in milliseconds (routes/admin.js period()).
export async function loadPeriod(period) {
  const range = typeof period === 'number' ? null : period;
  const days = range ? Math.max(1, Math.round((range.to - range.from) / DAY)) : period;
  const key = range ? `${range.from}-${range.to}` : String(days);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const fromMs = range ? range.from : Date.now() - days * DAY;
  const toMs = range ? Math.min(range.to, Date.now()) : Date.now();
  const from = Timestamp.fromMillis(fromMs);
  let activity = collection('activity').where('at', '>=', from);
  if (range) activity = activity.where('at', '<=', Timestamp.fromMillis(range.to));
  const [visitSnap, activitySnap, anonSnap] = await Promise.all([
    collection('visits').where('last', '>=', from).orderBy('last', 'desc').limit(20_000).get(),
    activity.limit(60_000).get(),
    // Visits from people who turned tracking off: a count per day, nothing more.
    collection('anonVisits').where('day', '>=', dayKey(fromMs)).get(),
  ]);
  const lastDay = dayKey(toMs);
  const anonVisits = anonSnap.docs
    .filter((doc) => doc.data().day <= lastDay)
    .reduce((sum, doc) => sum + (doc.data().count || 0), 0);
  const allVisits = visitSnap.docs.map((doc) => {
    const v = doc.data();
    return {
      ...v,
      id: doc.id,
      start: millis(v.start) || millis(v.last),
      last: millis(v.last),
      expireAt: undefined,
    };
  });
  // A range ending in the past: only visits that started by its end.
  const visits = range ? allVisits.filter((v) => v.start <= range.to) : allVisits;
  const bySid = new Map(visits.map((v) => [v.id, v]));
  const events = [];
  for (const doc of activitySnap.docs) {
    const a = doc.data();
    // Not pages: files such as /products/x.json opened directly.
    for (const e of a.events || []) if (!FILE.test(e.path || '')) events.push({ ...e, sid: a.sid, vid: a.vid });
  }
  events.sort((a, b) => a.t - b.t);
  // The days shown, oldest first: the last `days` days, or each day of the range.
  const dayKeys = [];
  if (range) for (let t = range.from; dayKey(t) <= lastDay; t += DAY) dayKeys.push(dayKey(t));
  else for (let i = days - 1; i >= 0; i -= 1) dayKeys.push(dayKey(toMs - i * DAY));
  const data = { days, from: fromMs, to: toMs, dayKeys, visits, bySid, events, anonVisits };
  cache.set(key, { at: Date.now(), data });
  return data;
}

const count = (items, keyOf) => {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined || key === null || key === '') continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

export const ACTION_LABELS = {
  call_click: 'Call button',
  whatsapp_click: 'WhatsApp',
  email_click: 'Email',
  directions_click: 'Directions',
  social_click: 'Social media',
  generate_lead: 'Enquiry sent',
  chat_open: 'Chat opened',
  chat_message: 'Chat question',
  view_item: 'Product viewed',
  newsletter_signup: 'Newsletter signup',
};

// Everything on the Overview page.
export function overview({ dayKeys, visits, events, anonVisits = 0 }) {
  const visitors = new Set(visits.map((v) => v.vid)).size;
  const pageviews = events.filter((e) => e.type === 'pageview');
  const active = visits.filter((v) => v.activeMs > 0);
  const bounced = visits.filter((v) => (v.pageviews || 0) <= 1 && (v.actions || 0) === 0);
  const actions = events.filter((e) => e.type === 'event');

  // One row per day, oldest first, with zero days filled in.
  const daily = dayKeys.map((day) => ({ day, visits: 0, visitors: new Set(), pageviews: 0, leads: 0 }));
  const dayIndex = new Map(daily.map((d, i) => [d.day, i]));
  for (const v of visits) {
    const row = daily[dayIndex.get(dayKey(v.start))];
    if (row) {
      row.visits += 1;
      row.visitors.add(v.vid);
    }
  }
  for (const e of pageviews) {
    const row = daily[dayIndex.get(dayKey(e.t))];
    if (row) row.pageviews += 1;
  }
  const leadNames = new Set(['generate_lead', 'call_click', 'whatsapp_click']);
  for (const e of actions) {
    const row = daily[dayIndex.get(dayKey(e.t))];
    if (row && leadNames.has(e.name)) row.leads += 1;
  }

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
  for (const v of visits) hours[hourOf(v.start)].value += 1;

  const productViews = count(
    actions.filter((e) => e.name === 'view_item'),
    (e) => e.params?.item_name || e.params?.item_id,
  );

  return {
    kpis: {
      visitors,
      visits: visits.length,
      anonVisits,
      pageviews: pageviews.length,
      avgTimeMs: active.length ? Math.round(active.reduce((s, v) => s + v.activeMs, 0) / active.length) : 0,
      pagesPerVisit: visits.length ? Math.round((pageviews.length / visits.length) * 10) / 10 : 0,
      bounceRate: visits.length ? Math.round((bounced.length / visits.length) * 100) : 0,
      returningRate: visits.length ? Math.round((visits.filter((v) => v.returning).length / visits.length) * 100) : 0,
      enquiries: actions.filter((e) => e.name === 'generate_lead').length,
      calls: actions.filter((e) => e.name === 'call_click').length,
      whatsapp: actions.filter((e) => e.name === 'whatsapp_click').length,
      chats: actions.filter((e) => e.name === 'chat_open').length,
    },
    daily: daily.map((d) => ({ ...d, visitors: d.visitors.size })),
    hours,
    sources: count(visits, (v) => v.source || 'Direct'),
    mediums: count(visits, (v) => v.medium || 'none'),
    campaigns: count(visits, (v) => v.utmCampaign),
    devices: count(visits, (v) => v.device),
    os: count(visits, (v) => v.os),
    browsers: count(visits, (v) => v.browser),
    screens: count(visits, (v) => v.screen),
    languages: count(visits, (v) => (v.lang || '').split('-')[0] || undefined),
    regions: count(visits, (v) => v.tz),
    landing: count(visits, (v) => v.landing),
    pages: pageStats({ visits, events }),
    products: productViews,
    actions: count(actions, (e) => e.name).map((a) => ({ ...a, label: ACTION_LABELS[a.name] || a.name })),
    recent: visits.slice(0, 12).map(visitSummary),
  };
}

// Per page: views, visitors, average time and scroll depth, exits.
export function pageStats({ visits, events }) {
  const pages = new Map();
  const get = (path) => {
    if (!pages.has(path)) pages.set(path, { path, title: '', views: 0, visitors: new Set(), ms: 0, msCount: 0, depth: 0, depthCount: 0, clicks: 0, exits: 0 });
    return pages.get(path);
  };
  for (const e of events) {
    const p = get(e.path);
    if (e.type === 'pageview') {
      p.views += 1;
      p.visitors.add(e.vid);
      if (e.title) p.title = e.title;
    } else if (e.type === 'leave' && e.ms) {
      p.ms += e.ms;
      p.msCount += 1;
    } else if (e.type === 'scroll' && Number.isFinite(e.depth)) {
      p.depth += e.depth;
      p.depthCount += 1;
    } else if (e.type === 'click') p.clicks += 1;
  }
  // The last page viewed in each visit is where the visitor left.
  const lastPage = new Map();
  for (const e of events) if (e.type === 'pageview') lastPage.set(e.sid, e.path);
  for (const path of lastPage.values()) get(path).exits += 1;
  return [...pages.values()]
    .filter((p) => p.views > 0)
    .map((p) => ({
      path: p.path,
      title: p.title.replace(/ \| Cholan Rice and Millet Shop.*$/, ''),
      views: p.views,
      visitors: p.visitors.size,
      avgTimeMs: p.msCount ? Math.round(p.ms / p.msCount) : 0,
      avgScroll: p.depthCount ? Math.round(p.depth / p.depthCount) : 0,
      clicks: p.clicks,
      exitRate: p.views ? Math.round((p.exits / p.views) * 100) : 0,
    }))
    .sort((a, b) => b.views - a.views);
}

export function visitSummary(v) {
  return {
    id: v.id,
    vid: v.vid,
    visitorNo: v.visitorNo || null,
    start: v.start,
    last: v.last,
    source: v.source || 'Direct',
    medium: v.medium,
    campaign: v.utmCampaign,
    referrer: v.referrer,
    landing: v.landing,
    device: v.device,
    os: v.os,
    browser: v.browser,
    screen: v.screen,
    lang: v.lang,
    tz: v.tz,
    returning: Boolean(v.returning),
    pageviews: v.pageviews || 0,
    clicks: v.clicks || 0,
    actions: v.actions || 0,
    actionNames: v.actionNames || [],
    pages: v.pages || [],
    activeMs: v.activeMs || 0,
  };
}

// One visit, step by step: pages with time spent, clicks and actions.
export function journey(sid, { bySid, events }) {
  const visit = bySid.get(sid);
  if (!visit) return null;
  return {
    visit: visitSummary(visit),
    steps: events
      .filter((e) => e.sid === sid)
      .map(({ sid: _s, vid: _v, ...e }) => e),
  };
}

// Clicks and scroll depth for one page, optionally for one kind of device.
export function heatmap(path, device, { bySid, events }) {
  const matches = (e) => e.path === path && (!device || bySid.get(e.sid)?.device === device);
  const clicks = events.filter((e) => e.type === 'click' && matches(e));
  const views = events.filter((e) => e.type === 'pageview' && matches(e));
  const scrolls = events.filter((e) => e.type === 'scroll' && matches(e));
  // How many visitors reached each depth.
  const reach = [10, 25, 50, 75, 90, 100].map((depth) => ({
    depth,
    share: scrolls.length ? Math.round((scrolls.filter((s) => s.depth >= depth).length / scrolls.length) * 100) : 0,
  }));
  const elements = count(clicks, (c) => c.label || c.href || c.tag).slice(0, 25);
  return {
    path,
    device: device || 'all',
    views: views.length,
    clicks: clicks.map((c) => ({ x: c.x, y: c.y, vw: c.vw, dh: c.dh, label: c.label })),
    elements,
    reach,
  };
}

// ---- The /warehouse analyst pages ----

// A product page; not the data files (.json) the site loads under /products.
const PRODUCT_PATH = /^\/products\/([^/?#.]+)\/?$/;
const cleanTitle = (title = '') => title.replace(/ \| Cholan Rice and Millet Shop.*$/, '');
const CONTACT_NAMES = new Set(['generate_lead', 'call_click', 'whatsapp_click', 'email_click']);
const isEnquireLink = (href = '') => /\/contact(\?|$)/.test(href);

// Where a visit came from, in the groups the journeys page filters by.
export function sourceGroup(v) {
  const src = String(v.source || '').toLowerCase();
  const med = String(v.medium || '').toLowerCase();
  const paid = /cpc|ppc|paid|ads?$|campaign/.test(med) || Boolean(v.utmCampaign);
  if (/facebook|instagram|meta|^fb|^ig/.test(src)) return paid ? 'Meta ads' : 'Facebook / Instagram';
  if (/google/.test(src)) return paid ? 'Google Ads' : 'Google search';
  if (/whatsapp/.test(src)) return 'WhatsApp';
  if (!src || src === 'direct') return 'Direct';
  return 'Other';
}

// Each product page: views, visitors, time, scroll, and what people did there.
export function productStats({ visits, events }) {
  const products = new Map();
  const get = (id) => {
    if (!products.has(id)) {
      products.set(id, {
        id,
        name: '',
        views: 0,
        visitors: new Set(),
        visits: new Set(),
        ms: 0,
        msCount: 0,
        depth: 0,
        depthCount: 0,
        enquire: 0,
        calls: 0,
        whatsapp: 0,
        enquiries: 0,
      });
    }
    return products.get(id);
  };
  const visitProducts = new Map(); // visit → product pages seen, for an enquiry sent later
  for (const e of events) {
    const id = PRODUCT_PATH.exec(e.path)?.[1];
    if (e.type === 'event' && e.name === 'generate_lead') {
      const asked = e.params?.product || e.params?.item_id;
      const ids = asked ? [String(asked)] : [...(visitProducts.get(e.sid) || [])];
      for (const pid of ids) get(pid).enquiries += 1;
      continue;
    }
    if (!id) continue;
    const p = get(id);
    if (e.type === 'pageview') {
      p.views += 1;
      p.visitors.add(e.vid);
      p.visits.add(e.sid);
      if (e.title) p.name = cleanTitle(e.title);
      if (!visitProducts.has(e.sid)) visitProducts.set(e.sid, new Set());
      visitProducts.get(e.sid).add(id);
    } else if (e.type === 'leave' && e.ms) {
      p.ms += e.ms;
      p.msCount += 1;
    } else if (e.type === 'scroll' && Number.isFinite(e.depth)) {
      p.depth += e.depth;
      p.depthCount += 1;
    } else if (e.type === 'click' && isEnquireLink(e.href)) p.enquire += 1;
    else if (e.type === 'event' && e.name === 'call_click') p.calls += 1;
    else if (e.type === 'event' && e.name === 'whatsapp_click') p.whatsapp += 1;
  }
  const total = visits.length || 1;
  return [...products.values()]
    .filter((p) => p.views > 0)
    .map((p) => ({
      id: p.id,
      name: p.name || p.id,
      views: p.views,
      visitors: p.visitors.size,
      reach: Math.round((p.visits.size / total) * 100),
      avgTimeMs: p.msCount ? Math.round(p.ms / p.msCount) : 0,
      avgScroll: p.depthCount ? Math.round(p.depth / p.depthCount) : 0,
      enquire: p.enquire,
      calls: p.calls,
      whatsapp: p.whatsapp,
      enquiries: p.enquiries,
      contactRate: p.visits.size ? Math.min(100, Math.round(((p.enquire + p.calls + p.whatsapp) / p.visits.size) * 100)) : 0,
    }))
    .sort((a, b) => b.views - a.views);
}

const bucket = (value, edges, labels) => labels[edges.findIndex((edge) => value < edge)] ?? labels[labels.length - 1];

// How people use the site: when, how long, how deep, what they press.
export function behaviour({ visits, events }) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, value: 0 }));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name) => ({ name, value: 0 }));
  for (const v of visits) {
    hours[hourOf(v.start)].value += 1;
    weekdays[istDate(v.start).getUTCDay()].value += 1;
  }
  const inOrder = (labels, list) => labels.map((name) => ({ name, value: list.filter((x) => x === name).length }));
  const timeLabels = ['Under 10s', '10–30s', '30s–1m', '1–3m', '3–10m', 'Over 10m'];
  const pageLabels = ['1 page', '2 pages', '3–4 pages', '5–9 pages', '10+ pages'];
  const clicks = events.filter((e) => e.type === 'click');
  const actions = events.filter((e) => e.type === 'event');
  const firstPage = new Map();
  const lastPage = new Map();
  for (const e of events) {
    if (e.type !== 'pageview') continue;
    if (!firstPage.has(e.sid)) firstPage.set(e.sid, e.path);
    lastPage.set(e.sid, e.path);
  }
  return {
    totals: {
      visits: visits.length,
      newVisits: visits.filter((v) => !v.returning).length,
      returningVisits: visits.filter((v) => v.returning).length,
      clicks: clicks.length,
      actions: actions.length,
      contacted: visits.filter((v) => (v.actionNames || []).some((n) => CONTACT_NAMES.has(n))).length,
    },
    hours,
    weekdays,
    timeOnSite: inOrder(timeLabels, visits.map((v) => bucket((v.activeMs || 0) / 1000, [10, 30, 60, 180, 600], timeLabels))),
    pagesPerVisit: inOrder(pageLabels, visits.map((v) => bucket(v.pageviews || 0, [2, 3, 5, 10], pageLabels))),
    devices: count(visits, (v) => v.device),
    actions: count(actions, (e) => e.name).map((a) => ({ ...a, label: ACTION_LABELS[a.name] || a.name })),
    clicked: count(clicks, (c) => c.label || c.href || c.tag).slice(0, 20),
    entries: count([...firstPage.values()], (p) => p).slice(0, 12),
    exits: count([...lastPage.values()], (p) => p).slice(0, 12),
  };
}

// How far down each page people scroll: the share of visits reaching each depth.
export function scrollDepth({ events }) {
  const pages = new Map();
  for (const e of events) {
    if (e.type !== 'pageview') continue;
    if (!pages.has(e.path)) pages.set(e.path, { path: e.path, title: '', views: 0, depths: new Map() });
    const p = pages.get(e.path);
    p.views += 1;
    if (e.title) p.title = cleanTitle(e.title);
  }
  // The deepest point reached on each page in each visit.
  for (const e of events) {
    if (e.type !== 'scroll' || !Number.isFinite(e.depth) || !pages.has(e.path)) continue;
    const depths = pages.get(e.path).depths;
    depths.set(e.sid, Math.max(depths.get(e.sid) || 0, e.depth));
  }
  return [...pages.values()]
    .map((p) => {
      const list = [...p.depths.values()];
      const share = (depth) => (list.length ? Math.round((list.filter((d) => d >= depth).length / list.length) * 100) : 0);
      return {
        path: p.path,
        title: p.title,
        views: p.views,
        measured: list.length,
        avg: list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : 0,
        reach: [25, 50, 75, 100].map((depth) => ({ depth, share: share(depth) })),
      };
    })
    .sort((a, b) => b.views - a.views);
}

// Each visit as a journey towards contacting the shop: visited, viewed a
// product, opened the enquiry form (the contact page or an Enquire button),
// and contacted (sent an enquiry, called or messaged on WhatsApp). The last
// step reached says where they stopped.
export const JOURNEY_STEPS = ['Visited', 'Viewed a product', 'Opened enquiry', 'Contacted'];
export function journeys({ visits, events }) {
  const bySid = new Map();
  for (const e of events) {
    if (!bySid.has(e.sid)) bySid.set(e.sid, []);
    bySid.get(e.sid).push(e);
  }
  return visits.map((v) => {
    const products = new Map();
    let enquire = false;
    let how = null;
    for (const e of bySid.get(v.id) || []) {
      const id = PRODUCT_PATH.exec(e.path)?.[1];
      if (e.type === 'pageview' && id) products.set(id, cleanTitle(e.title) || id);
      if (e.type === 'pageview' && /^\/contact\/?$/.test(e.path)) enquire = true;
      if (e.type === 'click' && isEnquireLink(e.href)) enquire = true;
      if (e.type === 'event' && CONTACT_NAMES.has(e.name) && !how) how = e.name;
    }
    for (const n of v.actionNames || []) if (!how && CONTACT_NAMES.has(n)) how = n;
    const step = how ? 4 : enquire ? 3 : products.size ? 2 : 1;
    const status = how
      ? { generate_lead: 'Sent enquiry', call_click: 'Called', whatsapp_click: 'WhatsApp', email_click: 'Emailed' }[how]
      : ['Left while browsing', 'Left at product', 'Left at enquiry'][step - 1];
    return {
      ...visitSummary(v),
      group: sourceGroup(v),
      step,
      status,
      contacted: Boolean(how),
      products: [...products.entries()].map(([id, name]) => ({ id, name })),
    };
  });
}

// Who is on the site now: visits active in the last 30 minutes, read fresh.
export async function realtime() {
  const now = Date.now();
  const from = Timestamp.fromMillis(now - 30 * 60_000);
  const [visitSnap, activitySnap] = await Promise.all([
    collection('visits').where('last', '>=', from).orderBy('last', 'desc').limit(500).get(),
    collection('activity').where('at', '>=', from).limit(3000).get(),
  ]);
  const visits = visitSnap.docs.map((doc) => {
    const v = doc.data();
    return { ...v, id: doc.id, start: millis(v.start) || millis(v.last), last: millis(v.last), expireAt: undefined };
  });
  const events = [];
  for (const doc of activitySnap.docs) for (const e of doc.data().events || []) events.push({ ...e, sid: doc.data().sid });
  events.sort((a, b) => b.t - a.t);
  const isActive = (v) => now - v.last <= 5 * 60_000;
  const current = new Map(); // visit → the page they are on
  for (const e of events) if (e.type === 'pageview' && !current.has(e.sid)) current.set(e.sid, e.path);
  const minutes = Array.from({ length: 30 }, (_, i) => ({ ago: 29 - i, value: 0 }));
  for (const e of events) {
    if (e.type !== 'pageview') continue;
    const ago = Math.floor((now - e.t) / 60_000);
    if (ago >= 0 && ago < 30) minutes[29 - ago].value += 1;
  }
  const active = visits.filter(isActive);
  return {
    at: now,
    activeNow: active.length,
    last30: visits.length,
    pageviews30: events.filter((e) => e.type === 'pageview').length,
    pagesNow: count(active, (v) => current.get(v.id) || v.landing),
    sources: count(visits, (v) => v.source || 'Direct'),
    devices: count(visits, (v) => v.device),
    minutes,
    visits: visits.slice(0, 50).map((v) => ({ ...visitSummary(v), page: current.get(v.id) || v.landing, activeNow: isActive(v) })),
    feed: events
      .filter((e) => e.type !== 'leave')
      .slice(0, 40)
      .map((e) => ({ t: e.t, sid: e.sid, type: e.type, path: e.path, label: e.label || ACTION_LABELS[e.name] || e.name || '', depth: e.depth })),
  };
}
