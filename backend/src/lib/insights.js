// Turns stored visitor activity (routes/track.js) into the dashboard's
// numbers. A period's visits and activity are read once and kept for a
// minute, so moving between dashboard pages does not re-read the database.
import { Timestamp } from '@google-cloud/firestore';
import { collection } from './firestore.js';

const CACHE_MS = 60_000;
const cache = new Map();

const IST_OFFSET = 330 * 60_000;
// Day and hour in India time, whatever the server's clock.
const istDate = (ms) => new Date(ms + IST_OFFSET);
export const dayKey = (ms) => istDate(ms).toISOString().slice(0, 10);
const hourOf = (ms) => istDate(ms).getUTCHours();

const millis = (ts) => (ts?.toMillis ? ts.toMillis() : typeof ts === 'number' ? ts : Date.parse(ts) || 0);

export async function loadPeriod(days) {
  const key = String(days);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const from = Timestamp.fromMillis(Date.now() - days * 86_400_000);
  const [visitSnap, activitySnap, anonSnap] = await Promise.all([
    collection('visits').where('last', '>=', from).orderBy('last', 'desc').limit(20_000).get(),
    collection('activity').where('at', '>=', from).limit(60_000).get(),
    // Visits from people who turned tracking off: a count per day, nothing more.
    collection('anonVisits').where('day', '>=', dayKey(from.toMillis())).get(),
  ]);
  const anonVisits = anonSnap.docs.reduce((sum, doc) => sum + (doc.data().count || 0), 0);
  const visits = visitSnap.docs.map((doc) => {
    const v = doc.data();
    return {
      ...v,
      id: doc.id,
      start: millis(v.start) || millis(v.last),
      last: millis(v.last),
      expireAt: undefined,
    };
  });
  const bySid = new Map(visits.map((v) => [v.id, v]));
  const events = [];
  for (const doc of activitySnap.docs) {
    const a = doc.data();
    for (const e of a.events || []) events.push({ ...e, sid: a.sid, vid: a.vid });
  }
  events.sort((a, b) => a.t - b.t);
  const data = { days, from: from.toMillis(), visits, bySid, events, anonVisits };
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
export function overview({ days, visits, events, anonVisits = 0 }) {
  const now = Date.now();
  const visitors = new Set(visits.map((v) => v.vid)).size;
  const pageviews = events.filter((e) => e.type === 'pageview');
  const active = visits.filter((v) => v.activeMs > 0);
  const bounced = visits.filter((v) => (v.pageviews || 0) <= 1 && (v.actions || 0) === 0);
  const actions = events.filter((e) => e.type === 'event');

  // One row per day, oldest first, with zero days filled in.
  const daily = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = dayKey(now - i * 86_400_000);
    daily.push({ day, visits: 0, visitors: new Set(), pageviews: 0, leads: 0 });
  }
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
