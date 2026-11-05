import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useDash } from '../context.js';
import { getProduct } from '../../lib/products.js';
import {
  Badge,
  BarList,
  Card,
  Drawer,
  Empty,
  ErrorNote,
  Icon,
  Loading,
  PageHead,
  Stat,
  ago,
  downloadCsv,
  num,
  pageName,
  useLoad,
  when,
} from '../ui.jsx';

const STATUS = {
  new: { label: 'New', tone: 'info' },
  contacted: { label: 'Contacted', tone: 'neutral' },
  quoted: { label: 'Quoted', tone: 'warn' },
  won: { label: 'Won', tone: 'good' },
  lost: { label: 'Lost', tone: 'muted' },
  spam: { label: 'Spam', tone: 'muted' },
};

// Where an enquiry came from on the site, in words.
const fromPage = (e) => {
  if (e.page) return pageName(e.page, e.page.startsWith('/products/') ? getProduct(e.page.split('/')[2])?.name : '');
  if (e.product) return getProduct(e.product)?.name || e.product;
  return 'Contact page';
};
const productName = (id) => (id ? getProduct(id)?.name || id : '');
const howFound = (e) => {
  if (e.utmSource) return `${e.utmSource}${e.utmCampaign ? ` · ${e.utmCampaign}` : ''}`;
  if (!e.referrer) return 'Direct';
  try {
    return new URL(e.referrer).hostname.replace(/^www\./, '');
  } catch {
    return e.referrer;
  }
};
const waLink = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const full = digits.length === 10 ? `91${digits}` : digits.replace(/^0/, '91');
  return `https://wa.me/${full}`;
};

export default function Enquiries() {
  const { days, allowed } = useDash();
  const { data, loading, error, reload, setData } = useLoad(() => api.enquiries(), []);
  const [filters, setFilters] = useState({ status: '', page: '', type: '', q: '' });
  const [openId, setOpenId] = useState(null);

  const inPeriod = useMemo(() => {
    const since = Date.now() - days * 86_400_000;
    return (data?.enquiries || []).filter((e) => Date.parse(e.createdAt) >= since);
  }, [data, days]);

  const list = useMemo(() => {
    const q = filters.q.toLowerCase();
    return inPeriod.filter(
      (e) =>
        (!filters.status || (e.status || 'new') === filters.status) &&
        (!filters.page || fromPage(e) === filters.page) &&
        (!filters.type || e.enquiryType === filters.type) &&
        (!q || [e.name, e.phone, e.email, e.message, e.note, productName(e.product)].join(' ').toLowerCase().includes(q)),
    );
  }, [inPeriod, filters]);

  const byPage = useMemo(() => {
    const map = new Map();
    for (const e of inPeriod) map.set(fromPage(e), (map.get(fromPage(e)) || 0) + 1);
    return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [inPeriod]);
  const byType = useMemo(() => {
    const map = new Map();
    for (const e of inPeriod) map.set(e.enquiryType, (map.get(e.enquiryType) || 0) + 1);
    return [...map].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [inPeriod]);
  const statusCount = (s) => inPeriod.filter((e) => (e.status || 'new') === s).length;

  const update = async (id, patch) => {
    const result = await api.updateEnquiry(id, patch);
    setData({ ...data, enquiries: data.enquiries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: result.updatedAt } : e)) });
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this enquiry for good? This cannot be undone.')) return;
    await api.deleteEnquiry(id);
    setOpenId(null);
    setData({ ...data, enquiries: data.enquiries.filter((e) => e.id !== id) });
  };

  const exportCsv = () =>
    downloadCsv(`cholan-enquiries-${days}d.csv`, [
      ['Received', 'Name', 'Phone', 'Email', 'Type', 'Product', 'Message', 'From page', 'How they found us', 'Status', 'Note'],
      ...list.map((e) => [
        e.createdAt,
        e.name,
        e.phone,
        e.email || '',
        e.enquiryType,
        productName(e.product),
        e.message,
        fromPage(e),
        howFound(e),
        STATUS[e.status || 'new']?.label,
        e.note || '',
      ]),
    ]);

  const open = list.find((e) => e.id === openId) || inPeriod.find((e) => e.id === openId);

  return (
    <div className="dash-page">
      <PageHead
        title="Enquiries"
        intro="Every enquiry from the website, with the page it was sent from. Mark each one as you follow it up."
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
            <Icon name="download" /> Export to Excel
          </button>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="dash-stats">
            <Stat icon="inbox" label="Enquiries" value={num(inPeriod.length)} sub="in this period" />
            <Stat icon="star" label="New" value={num(statusCount('new'))} sub="not followed up yet" />
            <Stat icon="phone" label="Contacted or quoted" value={num(statusCount('contacted') + statusCount('quoted'))} />
            <Stat icon="check" label="Won" value={num(statusCount('won'))} sub={inPeriod.length ? `${Math.round((statusCount('won') / inPeriod.length) * 100)}% of enquiries` : ''} />
          </div>
          {inPeriod.length > 0 && (
            <div className="dash-grid dash-grid--2">
              <Card title="Enquiries by page" hint="The page each enquiry was sent from. Click one to filter.">
                <BarList items={byPage} onPick={(p) => setFilters({ ...filters, page: p.name })} />
              </Card>
              <Card title="By type">
                <BarList items={byType} onPick={(t) => setFilters({ ...filters, type: t.name })} />
              </Card>
            </div>
          )}
          <div className="dash-filters">
            <label className="dash-search">
              <Icon name="search" />
              <input placeholder="Search name, phone, message…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            </label>
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status">
              <option value="">All statuses</option>
              {Object.entries(STATUS).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label}
                </option>
              ))}
            </select>
            <select value={filters.page} onChange={(e) => setFilters({ ...filters, page: e.target.value })} aria-label="Page">
              <option value="">All pages</option>
              {byPage.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
            {(filters.status || filters.page || filters.type || filters.q) && (
              <button type="button" className="dash-link" onClick={() => setFilters({ status: '', page: '', type: '', q: '' })}>
                Clear filters
              </button>
            )}
          </div>
          {!list.length ? (
            <Empty icon="inbox" title={inPeriod.length ? 'No enquiries match' : 'No enquiries in this period'}>
              {inPeriod.length ? 'Clear the filters to see them all.' : 'New enquiries from the contact form appear here within a minute.'}
            </Empty>
          ) : (
            <Card>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>About</th>
                      <th>From page</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.id} className="dash-row-link" onClick={() => setOpenId(e.id)}>
                        <td className="dash-nowrap" title={when(e.createdAt)}>
                          {ago(e.createdAt)}
                        </td>
                        <td>
                          <strong>{e.name}</strong>
                        </td>
                        <td className="dash-nowrap">{e.phone}</td>
                        <td>
                          {e.enquiryType}
                          {e.product && <span className="dash-muted dash-block">{productName(e.product)}</span>}
                        </td>
                        <td>{fromPage(e)}</td>
                        <td>
                          <Badge tone={STATUS[e.status || 'new'].tone}>{STATUS[e.status || 'new'].label}</Badge>
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
      <Drawer open={Boolean(open)} onClose={() => setOpenId(null)} title="Enquiry">
        {open && <EnquiryDetail e={open} onUpdate={update} onDelete={allowed('admin') ? remove : null} />}
      </Drawer>
    </div>
  );
}

function EnquiryDetail({ e, onUpdate, onDelete }) {
  const { allowed } = useDash();
  const [note, setNote] = useState(e.note || '');
  const [saving, setSaving] = useState('');
  const save = async (patch, label) => {
    setSaving(label);
    try {
      await onUpdate(e.id, patch);
      setSaving('saved');
      setTimeout(() => setSaving(''), 1500);
    } catch (error) {
      setSaving('');
      window.alert(error.message);
    }
  };
  return (
    <div className="dash-enquiry">
      <div className="dash-enquiry__who">
        <span className="dash-me__avatar dash-me__avatar--lg">{e.name?.[0]?.toUpperCase()}</span>
        <div>
          <h3>{e.name}</h3>
          <span className="dash-muted">{when(e.createdAt)}</span>
        </div>
      </div>
      <div className="dash-enquiry__actions">
        <a className="dash-btn" href={`tel:${e.phone}`}>
          <Icon name="phone" /> Call {e.phone}
        </a>
        <a className="dash-btn dash-btn--wa" href={waLink(e.phone)} target="_blank" rel="noreferrer">
          <Icon name="chat" /> WhatsApp
        </a>
        {allowed('admin') && (
          <a
            className="dash-btn dash-btn--ghost"
            href={`/warehouse/orders/new?${new URLSearchParams({ enquiry: e.id, name: e.name || '', phone: e.phone || '', product: e.product || '', message: e.message || '' })}`}
          >
            <Icon name="plus" /> Make an order
          </a>
        )}
        {e.email && (
          <a className="dash-btn dash-btn--ghost" href={`mailto:${e.email}?subject=${encodeURIComponent('Your enquiry — Cholan Rice and Millet Shop')}`}>
            <Icon name="mail" /> Email
          </a>
        )}
      </div>
      <dl className="dash-facts">
        <div>
          <dt>Type</dt>
          <dd>{e.enquiryType}</dd>
        </div>
        {e.product && (
          <div>
            <dt>Product</dt>
            <dd>{productName(e.product)}</dd>
          </div>
        )}
        <div>
          <dt>Sent from</dt>
          <dd>
            {fromPage(e)}
            {e.page && <span className="dash-muted"> ({e.page})</span>}
          </dd>
        </div>
        <div>
          <dt>First page of the visit</dt>
          <dd>{e.landing ? pageName(e.landing) : '—'}</dd>
        </div>
        <div>
          <dt>How they found us</dt>
          <dd>{howFound(e)}</dd>
        </div>
        {e.email && (
          <div>
            <dt>Email</dt>
            <dd>{e.email}</dd>
          </div>
        )}
      </dl>
      <h3 className="dash-subhead">Message</h3>
      <p className="dash-enquiry__msg">{e.message}</p>
      {e.sessionId && (
        <Link className="dash-link" to={`/dashboard/visitors?visit=${e.sessionId}`}>
          See this visitor’s journey on the site →
        </Link>
      )}
      <h3 className="dash-subhead">Status</h3>
      <div className="dash-status-pick">
        {Object.entries(STATUS).map(([key, s]) => (
          <button
            key={key}
            type="button"
            className={`dash-chip${(e.status || 'new') === key ? ' is-on' : ''}`}
            onClick={() => save({ status: key }, 'status')}
          >
            {s.label}
          </button>
        ))}
      </div>
      <h3 className="dash-subhead">Notes</h3>
      <textarea
        className="dash-textarea"
        rows={4}
        placeholder="e.g. Called on Monday, sent price for 26 kg Ponni, follow up Friday."
        value={note}
        onChange={(ev) => setNote(ev.target.value)}
      />
      <div className="dash-row">
        <button type="button" className="dash-btn" onClick={() => save({ note }, 'note')} disabled={note === (e.note || '')}>
          Save note
        </button>
        {saving === 'saved' && <span className="dash-saved">Saved</span>}
        <span className="dash-grow" />
        {onDelete && (
          <button type="button" className="dash-btn dash-btn--danger" onClick={() => onDelete(e.id)}>
            <Icon name="trash" /> Delete
          </button>
        )}
      </div>
      {e.updatedBy && (
        <p className="dash-muted dash-small">
          Last changed by {e.updatedBy}, {ago(e.updatedAt)}
        </p>
      )}
    </div>
  );
}
