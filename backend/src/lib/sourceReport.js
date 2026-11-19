// The Sources report in /admin: for each channel (Google Ads, Meta Ads,
// LinkedIn, Google search, WhatsApp, Direct…) and each campaign, how many
// visits, enquiries, website orders and how much they sold.
//
// Visits are counted by how that visit arrived. Enquiries and orders count
// for the visit's source or, when that visit came straight to the site, the
// last source seen on the device in the past 30 days (lib/sources.js).
import { config } from '../config.js';
import { dbEnabled, query } from '../db/pool.js';
import { firestore } from './firestore.js';
import { classify } from './sources.js';

const CONTACT_NAMES = new Set(['generate_lead', 'call_click', 'whatsapp_click', 'email_click']);
const NOT_RECORDED = 'Not recorded';
const NO_CAMPAIGN = '(no campaign)';

const blank = (channel) => ({ channel, visits: 0, visitors: new Set(), contacted: 0, enquiries: 0, orders: 0, revenuePaise: 0 });
const finish = (row) => ({
  ...row,
  visitors: row.visitors.size,
  // Orders per 100 visits; none when there were no visits to count from.
  orderRate: row.visits ? Math.round((row.orders / row.visits) * 1000) / 10 : null,
  enquiryRate: row.visits ? Math.round(((row.enquiries + row.contacted) / row.visits) * 1000) / 10 : null,
});

// Pure: adds up visits, enquiries and orders already read.
export function sourceTable({ visits = [], enquiries = [], orders = [] }) {
  const channels = new Map();
  const campaigns = new Map();
  const firstFound = new Map();
  const channel = (name) => {
    if (!channels.has(name)) channels.set(name, blank(name));
    return channels.get(name);
  };
  const campaign = (c) => {
    if (c.channel === 'Direct' || c.channel === NOT_RECORDED) return null;
    const name = c.campaign || NO_CAMPAIGN;
    // A named campaign is one row whatever site it ran on (a Meta ad shows
    // on Facebook and Instagram); untagged visits are one row per site.
    const key = c.campaign ? `${c.channel}||${name.toLowerCase()}` : `${c.channel}|${(c.source || '').toLowerCase()}|`;
    if (!campaigns.has(key)) campaigns.set(key, { ...blank(c.channel), sources: new Set(), mediums: new Set(), campaign: name });
    const row = campaigns.get(key);
    if (c.source) row.sources.add(c.source);
    if (c.medium) row.mediums.add(c.medium);
    return row;
  };

  for (const v of visits) {
    const c = classify(v);
    const rows = [channel(c.channel), campaign(c)].filter(Boolean);
    const contacted = (v.actionNames || []).some((n) => CONTACT_NAMES.has(n));
    for (const row of rows) {
      row.visits += 1;
      if (v.vid) row.visitors.add(v.vid);
      if (contacted) row.contacted += 1;
    }
  }
  for (const e of enquiries) {
    // Enquiries sent before sources were kept: sorted by their visit's tags.
    const c = e.channel
      ? { channel: e.channel, source: e.channelSource, medium: e.channelMedium, campaign: e.channelCampaign }
      : classify(e);
    for (const row of [channel(c.channel), campaign(c)].filter(Boolean)) row.enquiries += 1;
  }
  for (const o of orders) {
    const c = o.channel ? { channel: o.channel, source: o.source, medium: o.medium, campaign: o.campaign } : { channel: NOT_RECORDED };
    for (const row of [channel(c.channel), campaign(c)].filter(Boolean)) {
      row.orders += 1;
      row.revenuePaise += Number(o.subtotal_paise) || 0;
    }
    const first = o.first_channel || c.channel;
    const f = firstFound.get(first) || { channel: first, orders: 0, revenuePaise: 0 };
    f.orders += 1;
    f.revenuePaise += Number(o.subtotal_paise) || 0;
    firstFound.set(first, f);
  }

  const byWeight = (a, b) => b.revenuePaise - a.revenuePaise || b.orders - a.orders || b.enquiries - a.enquiries || b.visits - a.visits;
  const rows = [...channels.values()].map(finish).sort(byWeight);
  const totals = rows.reduce(
    (t, r) => ({
      visits: t.visits + r.visits,
      contacted: t.contacted + r.contacted,
      enquiries: t.enquiries + r.enquiries,
      orders: t.orders + r.orders,
      revenuePaise: t.revenuePaise + r.revenuePaise,
    }),
    { visits: 0, contacted: 0, enquiries: 0, orders: 0, revenuePaise: 0 },
  );
  totals.visitors = new Set(visits.map((v) => v.vid).filter(Boolean)).size;
  return {
    totals,
    channels: rows,
    campaigns: [...campaigns.values()]
      .map(({ sources, mediums, ...row }) => ({ ...finish(row), source: [...sources].join(', '), medium: [...mediums].join(', ') }))
      .sort(byWeight)
      .slice(0, 100),
    firstFound: [...firstFound.values()].sort((a, b) => b.revenuePaise - a.revenuePaise || b.orders - a.orders),
  };
}

async function enquiriesBetween(from, to) {
  const db = firestore();
  if (!db) return [];
  const snap = await db
    .collection(config.firestore.collection)
    .where('createdAt', '>=', new Date(from).toISOString())
    .where('createdAt', '<=', new Date(to).toISOString())
    .limit(5000)
    .get();
  return snap.docs.map((doc) => doc.data()).filter((e) => e.status !== 'spam');
}

// Website orders placed in the period and not cancelled (an online order
// still waiting for its payment is not counted yet).
async function ordersBetween(from, to) {
  if (!dbEnabled()) return { orders: [], connected: false };
  const { rows } = await query(
    `SELECT o.number, o.status, o.order_date, o.subtotal_paise, o.created_at,
            a.channel, a.source, a.medium, a.campaign, a.touch_from, a.first_channel, a.first_source, a.first_campaign
       FROM sales.orders o
       LEFT JOIN sales.order_attribution a ON a.order_id = o.id
      WHERE o.source = 'website' AND o.created_at >= $1 AND o.created_at <= $2
        AND o.status NOT IN ('awaiting_payment', 'cancelled')
      ORDER BY o.created_at DESC
      LIMIT 5000`,
    [new Date(from).toISOString(), new Date(to).toISOString()],
  );
  return { orders: rows, connected: true };
}

// The report for a period read by insights.loadPeriod. Without `money`
// (a Viewer), sales amounts and the order list are left out.
export async function sourceReport(data, { money = false } = {}) {
  const [enquiries, { orders, connected }] = await Promise.all([enquiriesBetween(data.from, data.to), ordersBetween(data.from, data.to)]);
  const table = sourceTable({ visits: data.visits, enquiries, orders });
  const report = {
    ...table,
    ordersConnected: connected,
    recentOrders: orders.slice(0, 50).map((o) => ({
      number: o.number,
      date: o.order_date,
      status: o.status,
      channel: o.channel || NOT_RECORDED,
      source: o.source || '',
      campaign: o.campaign || '',
      fromEarlierVisit: o.touch_from === 'an earlier visit',
      firstChannel: o.first_channel || '',
      totalPaise: Number(o.subtotal_paise) || 0,
    })),
  };
  if (!money) {
    const strip = ({ revenuePaise, ...rest }) => rest;
    report.totals = strip(report.totals);
    report.channels = report.channels.map(strip);
    report.campaigns = report.campaigns.map(strip);
    report.firstFound = report.firstFound.map(strip);
    report.recentOrders = [];
  }
  return report;
}
