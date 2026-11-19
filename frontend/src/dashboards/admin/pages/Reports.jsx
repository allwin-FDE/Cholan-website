import { useState } from 'react';
import { api } from '../../shared/api.js';
import { periodName, useDash } from '../../shared/context.js';
import { Card, Icon, PageHead, downloadCsv } from '../../shared/ui.jsx';

// Spreadsheets for the chosen period, each built from the same numbers the
// other pages show.
const s = (ms) => Math.round((ms || 0) / 1000);
const REPORTS = [
  {
    key: 'daily',
    title: 'Daily summary',
    text: 'Visits, visitors, page views and contacts for each day.',
    build: async (days) => {
      const o = await api.overview(days);
      return [['Day', 'Visits', 'Visitors', 'Page views', 'Calls, WhatsApp and enquiries'], ...o.daily.map((d) => [d.day, d.visits, d.visitors, d.pageviews, d.leads])];
    },
  },
  {
    key: 'sources',
    title: 'Traffic sources',
    text: 'Where visits came from, by source, campaign and device.',
    build: async (days) => {
      const o = await api.overview(days);
      return [
        ['Group', 'Name', 'Visits'],
        ...o.sources.map((x) => ['Source', x.name, x.value]),
        ...o.campaigns.map((x) => ['Campaign', x.name, x.value]),
        ...o.devices.map((x) => ['Device', x.name, x.value]),
        ...o.landing.map((x) => ['Landing page', x.name, x.value]),
      ];
    },
  },
  {
    key: 'visits',
    title: 'Every visit',
    text: 'One row per visit: visitor number, source, device, pages, time and actions.',
    build: async (days) => {
      const { visits } = await api.visits(days, { limit: 1000 });
      return [
        ['Started', 'Visitor', 'Source', 'Campaign', 'Landing page', 'Pages', 'Device', 'OS', 'Browser', 'Time on site (s)', 'Clicks', 'Actions', 'Returning'],
        ...visits.map((v) => [
          new Date(v.start).toISOString(),
          v.visitorNo ? `V-${v.visitorNo}` : v.vid,
          v.source,
          v.campaign || '',
          v.landing,
          v.pageviews,
          v.device,
          v.os,
          v.browser,
          s(v.activeMs),
          v.clicks,
          v.actionNames.join(' '),
          v.returning ? 'yes' : 'no',
        ]),
      ];
    },
  },
  {
    key: 'journeys',
    title: 'Journeys',
    text: 'Each visit and the step it reached: product, enquiry, contacted.',
    build: async (days) => {
      const { journeys } = await api.journeys(days);
      return [
        ['Started', 'Visitor', 'Status', 'Step', 'Products viewed', 'Source group', 'Source', 'Name', 'Phone'],
        ...journeys.map((j) => [
          new Date(j.start).toISOString(),
          j.visitorNo ? `V-${j.visitorNo}` : j.vid,
          j.status,
          j.step,
          j.products.map((p) => p.name).join('; '),
          j.group,
          j.source,
          j.contact?.name || '',
          j.contact?.phone || '',
        ]),
      ];
    },
  },
  {
    key: 'pages',
    title: 'Pages',
    text: 'Views, visitors, time, scroll and exits for every page.',
    build: async (days) => {
      const { pages } = await api.pages(days);
      return [
        ['Page', 'Title', 'Views', 'Visitors', 'Avg time (s)', 'Avg scroll %', 'Clicks', 'Exit rate %'],
        ...pages.map((p) => [p.path, p.title, p.views, p.visitors, s(p.avgTimeMs), p.avgScroll, p.clicks, p.exitRate]),
      ];
    },
  },
  {
    key: 'products',
    title: 'Products',
    text: 'Views and enquiries for each product.',
    build: async (days) => {
      const { products } = await api.products(days);
      return [
        ['Product', 'Views', 'Visitors', 'Avg time (s)', 'Scrolled %', 'Enquire taps', 'Calls', 'WhatsApp', 'Enquiries', 'Contact rate %'],
        ...products.map((p) => [p.name, p.views, p.visitors, s(p.avgTimeMs), p.avgScroll, p.enquire, p.calls, p.whatsapp, p.enquiries, p.contactRate]),
      ];
    },
  },
  {
    key: 'enquiries',
    title: 'Enquiries',
    text: 'Every enquiry with the person’s details and status.',
    role: 'editor',
    build: async () => {
      const { enquiries } = await api.enquiries();
      return [
        ['Received', 'Name', 'Phone', 'Email', 'Product', 'Message', 'Status', 'Page'],
        ...enquiries.map((e) => [e.createdAt, e.name, e.phone, e.email, e.product || '', e.message || '', e.status || 'new', e.page || '']),
      ];
    },
  },
];

export default function Reports() {
  const { days, allowed } = useDash();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const get = async (r) => {
    setBusy(r.key);
    setError('');
    try {
      downloadCsv(`cholan-${r.key}-${r.key === 'enquiries' ? 'all' : periodName(days)}.csv`, await r.build(days));
    } catch (e) {
      setError(`${r.title}: ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="dash-page">
      <PageHead title="Reports" intro="Download any report for the chosen period as a spreadsheet (CSV, opens in Excel or Google Sheets)" />
      {error && (
        <div className="dash-error" role="alert">
          {error}
        </div>
      )}
      <div className="dash-grid dash-grid--3">
        {REPORTS.filter((r) => !r.role || allowed(r.role)).map((r) => (
          <Card key={r.key} title={r.title} className="an-report">
            <p className="dash-muted">{r.text}</p>
            <button type="button" className="dash-btn" onClick={() => get(r)} disabled={busy === r.key}>
              <Icon name="download" /> {busy === r.key ? 'Preparing…' : 'Download CSV'}
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}
