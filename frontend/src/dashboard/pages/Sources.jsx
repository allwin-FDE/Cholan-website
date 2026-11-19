import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { can, periodName, useDash } from '../context.js';
import { Badge, Card, Empty, ErrorNote, Icon, Loading, PageHead, Stat, dateOnly, downloadCsv, num, useLoad } from '../ui.jsx';

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const money = (paise) => rupees.format((paise || 0) / 100);
const rate = (v) => (v === null || v === undefined ? '—' : `${v}%`);

// Where people come from: Google Ads, Meta Ads, LinkedIn, Google search,
// WhatsApp, Direct… with the visits, enquiries, orders and sales each brought.
export default function Sources() {
  const { days, role } = useDash();
  const showMoney = can(role, 'editor');
  const { data, loading, error, reload } = useLoad(() => api.sources(days), [days]);
  const t = data?.totals;

  const columns = useMemo(
    () => [
      { key: 'visits', label: 'Visits', format: num, hint: 'Visits that arrived this way' },
      { key: 'contacted', label: 'Called / WhatsApp', format: num, hint: 'Visits that tapped Call, WhatsApp, Email or sent the form' },
      { key: 'enquiries', label: 'Enquiries', format: num, hint: 'Enquiry forms sent' },
      { key: 'orders', label: 'Orders', format: num, hint: 'Website orders, not counting cancelled or unpaid ones' },
      ...(showMoney ? [{ key: 'revenuePaise', label: 'Sales', format: money, hint: 'Value of those orders, with GST' }] : []),
      { key: 'orderRate', label: 'Orders per 100 visits', format: rate, hint: 'How well the visits turn into orders' },
    ],
    [showMoney],
  );

  const exportCsv = () =>
    downloadCsv(`cholan-sources-${periodName(days)}.csv`, [
      ['Channel', 'Source', 'Medium', 'Campaign', ...columns.map((c) => c.label)],
      ...data.channels.map((r) => [r.channel, '', '', '', ...columns.map((c) => r[c.key] ?? '')]),
      ...data.campaigns.map((r) => [r.channel, r.source, r.medium, r.campaign, ...columns.map((c) => r[c.key] ?? '')]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Sources"
        intro="Where visitors, enquiries and orders come from: ads, social media, search, WhatsApp and more"
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!data?.channels?.length}>
            <Icon name="download" /> Export
          </button>
        }
      />
      {loading && !data && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && !data.channels.length && (
        <Empty icon="globe" title="Nothing in this period">
          Pick a longer period.
        </Empty>
      )}
      {data && data.channels.length > 0 && (
        <>
          <div className="dash-stats">
            <Stat label="Visits" value={num(t.visits)} sub={`${num(t.visitors)} people`} icon="users" />
            <Stat label="Called or WhatsApped" value={num(t.contacted)} icon="phone" />
            <Stat label="Enquiries" value={num(t.enquiries)} icon="inbox" />
            <Stat label="Website orders" value={num(t.orders)} icon="cart" />
            {showMoney && <Stat label="Sales" value={money(t.revenuePaise)} icon="rupee" />}
          </div>
          {!data.ordersConnected && <p className="dash-muted">Orders are not shown: the business database is not connected here.</p>}

          <Card title="By channel" hint="An enquiry or order made on a visit that came straight to the site counts for the ad or post that brought the person in the past 30 days.">
            <SourceTable rows={data.channels} columns={columns} />
          </Card>

          <Card title="Campaigns" hint="Each tagged link, ad campaign or site. Tag your links with the link maker below to see them here by name.">
            {data.campaigns.length ? (
              <SourceTable rows={data.campaigns} columns={columns} campaign />
            ) : (
              <p className="dash-muted">No campaigns or other sites in this period.</p>
            )}
          </Card>

          <div className="dash-grid dash-grid--2">
            {data.firstFound.length > 0 && (
              <Card title="How buyers first found you" hint="The first way each buyer's phone or computer came to the site, even months before the order">
                <ul className="src-list">
                  {data.firstFound.map((f) => (
                    <li key={f.channel}>
                      <span>{f.channel}</span>
                      <strong>
                        {num(f.orders)} {f.orders === 1 ? 'order' : 'orders'}
                        {showMoney && ` · ${money(f.revenuePaise)}`}
                      </strong>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card title="Where the numbers come from">
              <ul className="src-notes">
                <li>
                  <strong>Ads</strong> are recognised by the code Google, Microsoft and LinkedIn add to the link, and by the link's tags (utm_source, utm_medium,
                  utm_campaign).
                </li>
                <li>
                  <strong>Social, search, AI assistants and directories</strong> are recognised by the site the person came from.
                </li>
                <li>
                  <strong>Direct</strong>: typed the address, a bookmark, or an app that hides where it came from (WhatsApp and Instagram's apps often do). Tag
                  links you share there.
                </li>
                <li>
                  <strong>Not recorded</strong>: orders placed before sources were kept.
                </li>
              </ul>
            </Card>
          </div>

          {showMoney && data.recentOrders.length > 0 && (
            <Card title="Recent website orders" hint="Latest 50 in this period">
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Came from</th>
                      <th>Campaign</th>
                      <th>First found you</th>
                      <th className="dash-num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((o) => (
                      <tr key={o.number}>
                        <td data-label="Order">
                          <strong>{o.number}</strong>
                        </td>
                        <td data-label="Date">{dateOnly(o.date)}</td>
                        <td data-label="Came from">
                          {o.channel}
                          {o.fromEarlierVisit && (
                            <>
                              {' '}
                              <Badge>earlier visit</Badge>
                            </>
                          )}
                          {o.source && o.source !== o.channel && <span className="dash-muted dash-block">{o.source}</span>}
                        </td>
                        <td data-label="Campaign">{o.campaign || '—'}</td>
                        <td data-label="First found you">{o.firstChannel || '—'}</td>
                        <td data-label="Amount" className="dash-num">
                          {money(o.totalPaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <LinkMaker />
    </div>
  );
}

function SourceTable({ rows, columns, campaign = false }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table dash-table--num">
        <thead>
          <tr>
            <th>{campaign ? 'Campaign' : 'Channel'}</th>
            {columns.map((c) => (
              <th key={c.key} title={c.hint}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={campaign ? `${r.channel}|${r.source}|${r.campaign}` : r.channel}>
              <td>
                <strong>{campaign ? r.campaign : r.channel}</strong>
                {campaign && (
                  <span className="dash-muted dash-block">
                    {r.channel}
                    {r.source && r.source !== r.channel ? ` · ${r.source}` : ''}
                    {r.medium && r.medium !== 'campaign' ? ` / ${r.medium}` : ''}
                  </span>
                )}
              </td>
              {columns.map((c) => (
                <td key={c.key}>{c.format(r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Ready-made tags for the places Cholan shares links.
const PLACES = [
  { id: 'meta', label: 'Meta ad (Facebook / Instagram)', source: 'facebook', medium: 'paid' },
  { id: 'google', label: 'Google Ads', source: 'google', medium: 'cpc' },
  { id: 'linkedin-ad', label: 'LinkedIn ad', source: 'linkedin', medium: 'paid' },
  { id: 'linkedin', label: 'LinkedIn post', source: 'linkedin', medium: 'social' },
  { id: 'instagram', label: 'Instagram post, bio or story', source: 'instagram', medium: 'social' },
  { id: 'facebook', label: 'Facebook post', source: 'facebook', medium: 'social' },
  { id: 'youtube', label: 'YouTube', source: 'youtube', medium: 'social' },
  { id: 'whatsapp', label: 'WhatsApp message or status', source: 'whatsapp', medium: 'social' },
  { id: 'gbp', label: 'Google Business Profile', source: 'gbp', medium: 'organic' },
  { id: 'qr', label: 'QR code (bag, poster, flyer)', source: 'qr', medium: 'print' },
  { id: 'email', label: 'Email', source: 'newsletter', medium: 'email' },
  { id: 'sms', label: 'SMS', source: 'sms', medium: 'sms' },
];
const SITE = 'https://www.cholanrice.in';
const slug = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

// Makes a link that shows up on this page by name: the page to open, where
// it will be shared, and a campaign name.
function LinkMaker() {
  const [page, setPage] = useState('/');
  const [place, setPlace] = useState(PLACES[0].id);
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);
  const p = PLACES.find((x) => x.id === place);
  const path = page.trim().replace(/^https?:\/\/(www\.)?cholanrice\.in/i, '') || '/';
  const url = new URL(path.startsWith('/') ? path : `/${path}`, SITE);
  url.searchParams.set('utm_source', p.source);
  url.searchParams.set('utm_medium', p.medium);
  if (slug(campaign)) url.searchParams.set('utm_campaign', slug(campaign));
  const link = url.href;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };

  return (
    <Card title="Make a tracking link" hint="Use it in an ad, post, message or QR code: its visits, enquiries and orders then show above under its campaign name.">
      <div className="biz-form">
        <label className="dash-field">
          <span className="dash-field__label">Page to open</span>
          <input value={page} onChange={(e) => setPage(e.target.value)} placeholder="/ or /products/seeraga-samba" />
        </label>
        <label className="dash-field">
          <span className="dash-field__label">Where you will share it</span>
          <select value={place} onChange={(e) => setPlace(e.target.value)}>
            {PLACES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-field">
          <span className="dash-field__label">Campaign name</span>
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. Pongal offer" maxLength={80} />
        </label>
      </div>
      <div className="src-link">
        <code>{link}</code>
        <button type="button" className="dash-btn" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <details className="src-help">
        <summary>Setting up ads so every click is counted</summary>
        <ul>
          <li>
            <strong>Google Ads:</strong> keep auto-tagging on (Admin → Account settings). Every ad click is then counted as Google Ads, with no tags needed.
          </li>
          <li>
            <strong>Meta Ads:</strong> in each ad, under Tracking → URL parameters, paste{' '}
            <code>utm_source={'{{site_source_name}}'}&amp;utm_medium=paid&amp;utm_campaign={'{{campaign.name}}'}</code>. Each campaign then shows by name.
          </li>
          <li>
            <strong>LinkedIn Ads:</strong> turn on auto-tagging in Campaign Manager, or use a link made here with “LinkedIn ad”.
          </li>
          <li>
            <strong>WhatsApp, Instagram bio, QR codes:</strong> these apps hide where people came from, so use a link made here, or they show as Direct.
          </li>
        </ul>
      </details>
    </Card>
  );
}
