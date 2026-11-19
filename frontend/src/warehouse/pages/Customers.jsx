import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../dashboard/api.js';
import { useUrl, useUrlSearch } from '../../dashboard/urlState.js';
import { periodBounds, periodName, useDash } from '../../dashboard/context.js';
import { Empty, ErrorNote, Icon, Loading, PageHead, Stat, dateOnly, downloadCsv, num, useLoad, when } from '../../dashboard/ui.jsx';

// Everyone who has enquired, one row per person (matched by phone, else
// email), with every enquiry they sent. Spam is left out.
const digits = (phone = '') => String(phone).replace(/\D/g, '');
const keyOf = (e) => digits(e.phone).slice(-10) || (e.email || '').toLowerCase() || e.id;
const waLink = (phone) => `https://wa.me/${digits(phone).length === 10 ? `91${digits(phone)}` : digits(phone)}`;
const TONE = { new: 'info', contacted: 'warn', quoted: 'warn', won: 'good', lost: 'muted' };

export default function Customers() {
  const { days, base } = useDash();
  const { data, loading, error, reload } = useLoad(() => api.enquiries(), []);
  // The address holds the view: ?q=…&status=…&person=KEY.
  const { get, patch } = useUrl();
  const [q, setQ] = useUrlSearch();
  const status = get('status');
  const setStatus = (value) => patch({ status: value }, { replace: true });
  const open = get('person') || null;
  const setOpen = (key) => patch({ person: key });

  const people = useMemo(() => {
    const map = new Map();
    const list = (data?.enquiries || []).filter((e) => e.status !== 'spam');
    for (const e of [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
      const key = keyOf(e);
      if (!map.has(key)) map.set(key, { key, name: '', phone: '', email: '', enquiries: [], products: new Set() });
      const p = map.get(key);
      p.name = e.name || p.name;
      p.phone = e.phone || p.phone;
      p.email = e.email || p.email;
      if (e.product) p.products.add(e.product);
      p.enquiries.push(e);
    }
    return [...map.values()]
      .map((p) => {
        const latest = p.enquiries[p.enquiries.length - 1];
        return { ...p, products: [...p.products], first: p.enquiries[0].createdAt, last: latest.createdAt, status: latest.status || 'new' };
      })
      .sort((a, b) => Date.parse(b.last) - Date.parse(a.last));
  }, [data]);

  const { from, to } = periodBounds(days);
  const inPeriod = people.filter((p) => Date.parse(p.last) >= from && Date.parse(p.last) <= to);
  const shown = inPeriod.filter(
    (p) =>
      (!status || p.status === status) &&
      (!q || [p.name, p.phone, p.email, ...p.products, ...p.enquiries.map((e) => e.message)].join(' ').toLowerCase().includes(q.toLowerCase())),
  );
  const statuses = [...new Set(inPeriod.map((p) => p.status))];

  const csv = () =>
    downloadCsv(`cholan-customers-${periodName(days)}.csv`, [
      ['Name', 'Phone', 'Email', 'Enquiries', 'Products asked about', 'First enquiry', 'Latest enquiry', 'Status'],
      ...shown.map((p) => [p.name, p.phone, p.email, p.enquiries.length, p.products.join('; '), p.first, p.last, p.status]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Customers"
        intro="Everyone who enquired, with each enquiry they sent. The period picks who enquired last in it."
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={csv} disabled={!shown.length}>
            <Icon name="download" /> Download CSV
          </button>
        }
      />
      {loading && !data && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="dash-stats">
            <Stat label="Customers" value={num(inPeriod.length)} sub="enquired in this period" icon="user" />
            <Stat label="New" value={num(inPeriod.filter((p) => Date.parse(p.first) >= from).length)} sub="first enquiry in this period" icon="plus" />
            <Stat label="Came back" value={num(inPeriod.filter((p) => p.enquiries.length > 1).length)} sub="more than one enquiry" icon="refresh" />
            <Stat label="Won" value={num(inPeriod.filter((p) => p.status === 'won').length)} sub="marked won in Enquiries" icon="check" />
          </div>
          <section className="dash-card an-list">
            <div className="an-filterbar">
              <div className="an-chips">
                <button type="button" className={`dash-chip${!status ? ' is-on' : ''}`} onClick={() => setStatus('')}>
                  All
                </button>
                {statuses.map((s) => (
                  <button key={s} type="button" className={`dash-chip${status === s ? ' is-on' : ''}`} onClick={() => setStatus(s)}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <label className="dash-search an-search">
                <Icon name="search" />
                <input className="dash-input" type="search" placeholder="Search name, phone, email or product" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
            <div className="an-listbar">
              <span>
                {num(shown.length)} customer{shown.length === 1 ? '' : 's'}
              </span>
            </div>
            {!shown.length && <Empty icon="user" title="No customers match">Try a longer period or clear the search.</Empty>}
            {shown.map((p) => (
              <article key={p.key} className="an-row an-row--customer">
                <div className="an-row__who">
                  <strong className="an-row__name">{p.name || 'No name given'}</strong>
                  {p.phone && <span>{p.phone}</span>}
                  {p.email && <span className="dash-muted">{p.email}</span>}
                  <span className="an-row__btns">
                    {p.phone && (
                      <a className="an-mini" href={`tel:${digits(p.phone)}`}>
                        Call
                      </a>
                    )}
                    {p.phone && (
                      <a className="an-mini" href={waLink(p.phone)} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    )}
                    {p.email && (
                      <a className="an-mini" href={`mailto:${p.email}`}>
                        Email
                      </a>
                    )}
                  </span>
                </div>
                <div className="an-row__what">
                  {p.products.length ? p.products.map((name) => <span key={name} className="an-row__product">{name}</span>) : <span className="an-row__product">General enquiry</span>}
                  <span className="dash-muted">
                    {p.enquiries.length} enquir{p.enquiries.length === 1 ? 'y' : 'ies'} · first {dateOnly(p.first)}
                  </span>
                </div>
                <div className="an-row__status">
                  <span className={`dash-badge dash-badge--${TONE[p.status] || 'neutral'}`}>{p.status}</span>
                  <span className="dash-muted">Latest {when(p.last)}</span>
                  <span className="an-row__btns">
                    <button type="button" className="an-mini" onClick={() => setOpen(open === p.key ? null : p.key)}>
                      {open === p.key ? 'Hide enquiries' : 'Show enquiries'}
                    </button>
                  </span>
                </div>
                {open === p.key && (
                  <ul className="an-enquiries">
                    {[...p.enquiries].reverse().map((e) => (
                      <li key={e.id}>
                        <span className="dash-muted">{when(e.createdAt)}</span>
                        <span>
                          {e.product && <strong>{e.product}: </strong>}
                          {e.message || 'No message'}
                        </span>
                        <span className="an-row__btns">
                          <Link className="an-mini" to={`${base}/enquiries`}>
                            In Enquiries
                          </Link>
                          {e.sessionId && (
                            <Link className="an-mini" to={`${base}/visitors?visit=${e.sessionId}`}>
                              Their visit
                            </Link>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
