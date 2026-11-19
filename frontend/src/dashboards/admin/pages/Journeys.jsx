import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api.js';
import { useUrl, useUrlSearch } from '../../shared/urlState.js';
import { periodName, useDash } from '../../shared/context.js';
import { Empty, ErrorNote, Icon, Loading, PageHead, downloadCsv, duration, num, pageName, useLoad, when } from '../../shared/ui.jsx';

// Visited → viewed a product → opened the enquiry → contacted: every visit,
// and the step where it stopped. Like the reference's checkout journeys, for
// a shop that takes enquiries instead of online orders.
const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'Left at enquiry', label: 'Left at enquiry' },
  { key: 'Left at product', label: 'Left at product' },
  { key: 'Left while browsing', label: 'Left while browsing' },
];
const TONE = { 4: 'good', 3: 'warn', 2: 'warn', 1: 'muted' };
const digits = (phone = '') => String(phone).replace(/\D/g, '');
const waLink = (phone) => `https://wa.me/${digits(phone).length === 10 ? `91${digits(phone)}` : digits(phone)}`;
const label = (j) => (j.visitorNo ? `V-${j.visitorNo}` : `#${(j.vid || j.id).slice(0, 6)}`);

export default function Journeys() {
  const { days, allowed, base } = useDash();
  const { data, loading, error, reload, setData } = useLoad(() => api.journeys(days), [days]);
  // The address holds the filters: ?status=…&group=…&q=….
  const { get, patch } = useUrl();
  const status = get('status');
  const setStatus = (value) => patch({ status: value }, { replace: true });
  const group = get('group');
  const setGroup = (value) => patch({ group: value }, { replace: true });
  const [q, setQ] = useUrlSearch();
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => data?.journeys || [], [data]);
  const steps = data?.steps || [];

  // Each step: how many reached it, and how many stopped there.
  const funnel = steps.map((name, i) => {
    const reached = all.filter((j) => j.step >= i + 1).length;
    const before = i ? all.filter((j) => j.step >= i).length : reached;
    return { name, reached, carried: before ? Math.round((reached / before) * 100) : 0, stopped: before - reached };
  });
  const groups = useMemo(() => {
    const map = new Map();
    for (const j of all) map.set(j.group, (map.get(j.group) || 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);
  const how = (name) => all.filter((j) => j.status === name).length;

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((j) => !status || (status === 'contacted' ? j.contacted : j.status === status))
      .filter((j) => !group || j.group === group)
      .filter(
        (j) =>
          !needle ||
          [label(j), j.contact?.name, j.contact?.phone, j.contact?.email, j.source, j.landing, ...j.products.map((p) => p.name), ...j.pages]
            .join(' ')
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => b.start - a.start);
  }, [all, status, group, q]);

  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShown = list.length > 0 && list.every((j) => picked.has(j.id));
  const pickAll = () => setPicked(allShown ? new Set() : new Set(list.map((j) => j.id)));

  const remove = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? 'Delete this journey from the reports?' : `Delete ${ids.length} journeys from the reports?`)) return;
    setBusy(true);
    try {
      await api.deleteVisits(ids);
      setData({ ...data, journeys: all.filter((j) => !ids.includes(j.id)) });
      setPicked(new Set());
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(false);
    }
  };

  const csv = () =>
    downloadCsv(`cholan-journeys-${periodName(days)}.csv`, [
      ['Started', 'Visitor', 'Name', 'Phone', 'Email', 'Status', 'Step', 'Products viewed', 'Landing page', 'Pages', 'Time on site (s)', 'Source group', 'Source', 'Campaign', 'Device'],
      ...list.map((j) => [
        new Date(j.start).toISOString(),
        label(j),
        j.contact?.name || '',
        j.contact?.phone || '',
        j.contact?.email || '',
        j.status,
        `${j.step} of ${steps.length}`,
        j.products.map((p) => p.name).join('; '),
        j.landing,
        j.pageviews,
        Math.round(j.activeMs / 1000),
        j.group,
        j.source,
        j.campaign || '',
        j.device,
      ]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Journeys"
        intro="Visit → product → enquiry → contacted: who stopped where"
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={csv} disabled={!list.length}>
            <Icon name="download" /> Download CSV
          </button>
        }
      />
      {loading && !data && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="an-steps">
            {funnel.map((f, i) => (
              <div key={f.name} className={`an-step${i === funnel.length - 1 ? ' an-step--last' : ''}`}>
                <span className="an-step__label">{f.name}</span>
                <span className="an-step__value">{num(f.reached)}</span>
                <span className="an-step__bar">
                  <span style={{ width: `${funnel[0].reached ? (f.reached / funnel[0].reached) * 100 : 0}%` }} />
                </span>
                {i > 0 && (
                  <span className="an-step__sub">
                    {f.carried}% carried on · <strong>{num(f.stopped)}</strong> stopped
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="an-notes">
            <span>
              Enquiries sent <strong>{num(how('Sent enquiry'))}</strong>
            </span>
            <span>
              Calls <strong>{num(how('Called'))}</strong>
            </span>
            <span>
              WhatsApp <strong>{num(how('WhatsApp'))}</strong>
            </span>
          </div>

          <section className="dash-card an-list">
            <div className="an-filterbar">
              <div className="an-chips">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.key || 'all'} type="button" className={`dash-chip${status === f.key ? ' is-on' : ''}`} onClick={() => setStatus(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="dash-search an-search">
                <Icon name="search" />
                <input className="dash-input" type="search" placeholder="Search name, phone, product or V-number" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
            <div className="an-chips">
              <button type="button" className={`dash-chip${!group ? ' is-on' : ''}`} onClick={() => setGroup('')}>
                All sources
              </button>
              {groups.map(([name, n]) => (
                <button key={name} type="button" className={`dash-chip${group === name ? ' is-on' : ''}`} onClick={() => setGroup(name)}>
                  {name} ({num(n)})
                </button>
              ))}
            </div>
            <div className="an-listbar">
              <span>
                {num(list.length)} journey{list.length === 1 ? '' : 's'}
              </span>
              {allowed('admin') && list.length > 0 && (
                <>
                  <label className="an-check">
                    <input type="checkbox" checked={allShown} onChange={pickAll} /> Select all shown
                  </label>
                  {picked.size > 0 && (
                    <button type="button" className="dash-btn dash-btn--danger dash-btn--sm" disabled={busy} onClick={() => remove([...picked])}>
                      <Icon name="trash" /> Delete {picked.size} selected
                    </button>
                  )}
                </>
              )}
            </div>

            {!list.length && <Empty icon="route" title="No journeys match">Try another period, status or source.</Empty>}
            {list.map((j) => (
              <article key={j.id} className="an-row">
                <div className="an-row__who">
                  {allowed('admin') && (
                    <label className="an-check">
                      <input type="checkbox" checked={picked.has(j.id)} onChange={() => toggle(j.id)} /> Select
                    </label>
                  )}
                  {j.contact ? (
                    <>
                      <strong className="an-row__name">{j.contact.name || 'No name given'}</strong>
                      {j.contact.phone && <span>{j.contact.phone}</span>}
                      {j.contact.email && <span className="dash-muted">{j.contact.email}</span>}
                      {j.contact.phone && (
                        <span className="an-row__btns">
                          <a className="an-mini" href={`tel:${digits(j.contact.phone)}`}>
                            Call
                          </a>
                          <a className="an-mini" href={waLink(j.contact.phone)} target="_blank" rel="noreferrer">
                            WhatsApp
                          </a>
                        </span>
                      )}
                    </>
                  ) : (
                    <strong className="an-row__name an-row__name--anon">Visitor {label(j)} (no details yet)</strong>
                  )}
                  <span className="dash-muted">
                    {[j.device, j.os, j.browser].filter(Boolean).join(' · ')}
                    {j.returning ? ' · returning' : ''}
                  </span>
                </div>
                <div className="an-row__what">
                  {j.products.length ? (
                    j.products.map((p) => (
                      <span key={p.id} className="an-row__product">
                        {p.name}
                      </span>
                    ))
                  ) : (
                    <span className="an-row__product">Landed on {pageName(j.landing)}</span>
                  )}
                  <span className="dash-muted">
                    {num(j.pageviews)} page{j.pageviews === 1 ? '' : 's'} · {duration(j.activeMs)}
                  </span>
                  {j.contact?.message && <span className="an-row__msg">“{j.contact.message}”</span>}
                </div>
                <div className="an-dots" aria-label={`Step ${j.step} of ${steps.length}`}>
                  {steps.map((s, i) => (
                    <span key={s} className={i < j.step ? 'is-on' : ''} title={s} />
                  ))}
                </div>
                <div className="an-row__status">
                  <span className={`dash-badge dash-badge--${TONE[j.step]}`}>{j.status}</span>
                  <span className="dash-muted">{when(j.start)}</span>
                  <span>
                    <strong>Source:</strong> {j.group}
                    {j.source && j.source !== j.group && j.source !== 'Direct' ? ` · ${j.source}` : ''}
                  </span>
                  {j.campaign && <span className="dash-muted">{j.campaign}</span>}
                  <span className="an-row__btns">
                    <Link className="an-mini" to={`${base}/visitors?visit=${j.id}`}>
                      Open journey
                    </Link>
                    {allowed('admin') && (
                      <button type="button" className="an-mini an-mini--danger" disabled={busy} onClick={() => remove([j.id])}>
                        Delete
                      </button>
                    )}
                  </span>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
