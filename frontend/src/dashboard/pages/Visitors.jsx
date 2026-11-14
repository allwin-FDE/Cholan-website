import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useDash } from '../context.js';
import {
  Badge,
  Card,
  Drawer,
  Empty,
  ErrorNote,
  Icon,
  Loading,
  PageHead,
  downloadCsv,
  duration,
  pageName,
  useLoad,
  when,
} from '../ui.jsx';

// A device's visitor number (V-12), the same on every visit from it. A visit
// from before numbering began shows a short form of its ID instead.
const visitorLabel = (v) => (v.visitorNo ? `V-${v.visitorNo}` : v.vid ? `#${v.vid.replace(/-/g, '').slice(0, 6)}` : '—');

const ACTIONS = {
  call_click: 'Called',
  whatsapp_click: 'WhatsApp',
  email_click: 'Emailed',
  directions_click: 'Directions',
  social_click: 'Social',
  generate_lead: 'Enquiry',
  chat_open: 'Chat',
  chat_message: 'Asked chat',
};

export default function Visitors() {
  const { days } = useDash();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ device: '', source: '', action: '', q: '' });
  const { data, loading, error, reload } = useLoad(() => api.visits(days, { limit: 1000 }), [days]);
  const openId = params.get('visit');

  // One row per visitor: their latest visit (of those matching the filters),
  // how many visits they made in the period, and everything they did. The
  // visitor whose latest visit started most recently comes first.
  const { list, visitCount } = useMemo(() => {
    if (!data) return { list: [], visitCount: 0 };
    const q = filters.q.toLowerCase();
    const matching = data.visits.filter(
      (v) =>
        (!filters.device || v.device === filters.device) &&
        (!filters.source || v.source === filters.source) &&
        (!filters.action || v.actionNames.includes(filters.action)) &&
        (!q || [visitorLabel(v), v.source, v.landing, v.referrer, v.campaign, v.os, v.browser, ...v.pages].join(' ').toLowerCase().includes(q)),
    );
    const byVisitor = new Map();
    for (const v of matching) {
      const key = v.vid || v.id;
      const row = byVisitor.get(key);
      if (!row) {
        byVisitor.set(key, { latest: v, visits: 1, no: v.visitorNo, did: new Set(v.actionNames) });
        continue;
      }
      row.visits += 1;
      row.no = row.no || v.visitorNo;
      v.actionNames.forEach((a) => row.did.add(a));
      if (v.start > row.latest.start) row.latest = v;
    }
    const rows = [...byVisitor.values()]
      .map((r) => ({ ...r.latest, visitorNo: r.no || null, visits: r.visits, did: [...r.did] }))
      .sort((a, b) => b.start - a.start);
    return { list: rows, visitCount: matching.length };
  }, [data, filters]);

  const options = (key) => [...new Set((data?.visits || []).map((v) => v[key]).filter(Boolean))].sort();

  const exportCsv = () =>
    downloadCsv(`cholan-visitors-${days}d.csv`, [
      ['Visitor', 'Visits', 'Latest visit', 'Source', 'Campaign', 'Landing page', 'Pages', 'Device', 'OS', 'Browser', 'Screen', 'Language', 'Time on site (s)', 'Clicks', 'Actions', 'Returning'],
      ...list.map((v) => [
        visitorLabel(v),
        v.visits,
        new Date(v.start).toISOString(),
        v.source,
        v.campaign || '',
        v.landing || '',
        v.pages.join(' > '),
        v.device,
        v.os,
        v.browser,
        v.screen || '',
        v.lang || '',
        Math.round(v.activeMs / 1000),
        v.clicks,
        v.did.join(' '),
        v.returning || v.visits > 1 ? 'yes' : 'no',
      ]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Visitors"
        intro="Every visitor, latest visit first. Each device has its own visitor number (V-1, V-2…), the same on every visit. Click a visitor to see how many times they came, each visit and its journey."
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
            <Icon name="download" /> Export
          </button>
        }
      />
      <div className="dash-filters">
        <label className="dash-search">
          <Icon name="search" />
          <input placeholder="Search visitor (V-12), pages, sources…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </label>
        <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} aria-label="Source">
          <option value="">All sources</option>
          {options('source').map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={filters.device} onChange={(e) => setFilters({ ...filters, device: e.target.value })} aria-label="Device">
          <option value="">All devices</option>
          {options('device').map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} aria-label="Action">
          <option value="">Any action</option>
          {Object.entries(ACTIONS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !list.length && <Empty icon="users" title="No visitors match">Try a longer period or clear the filters.</Empty>}
      {list.length > 0 && (
        <Card>
          <p className="dash-muted dash-count">
            {list.length} visitor{list.length === 1 ? '' : 's'} · {visitCount} visit{visitCount === 1 ? '' : 's'}
          </p>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Latest visit</th>
                  <th>Visits</th>
                  <th>Came from</th>
                  <th>Device</th>
                  <th>Time</th>
                  <th>Did</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 500).map((v) => (
                  <tr key={v.id} className="dash-row-link" onClick={() => setParams({ visit: v.id })}>
                    <td className="dash-nowrap">
                      <strong className="dash-visitor">{visitorLabel(v)}</strong>
                      {(v.returning || v.visits > 1) && <Badge tone="info">returning</Badge>}
                    </td>
                    <td className="dash-nowrap">{when(v.start)}</td>
                    <td className="dash-num">{v.visits}</td>
                    <td>
                      {v.source}
                      {v.campaign && <span className="dash-muted"> · {v.campaign}</span>}
                    </td>
                    <td className="dash-nowrap">
                      {v.device} · {v.os}
                    </td>
                    <td className="dash-nowrap">{duration(v.activeMs)}</td>
                    <td>
                      {v.did
                        .filter((a) => ACTIONS[a])
                        .map((a) => (
                          <Badge key={a} tone={a === 'generate_lead' || a === 'call_click' || a === 'whatsapp_click' ? 'good' : 'neutral'}>
                            {ACTIONS[a]}
                          </Badge>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Drawer open={Boolean(openId)} onClose={() => setParams({})} title="Visitor details" wide>
        {openId && <Journey id={openId} />}
      </Drawer>
    </div>
  );
}

export function Journey({ id }) {
  const { data, loading, error } = useLoad(() => api.visit(id), [id]);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const { visit: v, steps } = data;
  return (
    <div className="dash-journey">
      {v.vid && <DeviceVisits vid={v.vid} current={v.id} />}
      <h3 className="dash-subhead">This visit</h3>
      <dl className="dash-facts">
        <div>
          <dt>Started</dt>
          <dd>{when(v.start)}</dd>
        </div>
        <div>
          <dt>Came from</dt>
          <dd>
            {v.source}
            {v.referrer && <span className="dash-muted dash-break"> ({v.referrer})</span>}
          </dd>
        </div>
        {v.campaign && (
          <div>
            <dt>Campaign</dt>
            <dd>{v.campaign}</dd>
          </div>
        )}
        <div>
          <dt>Device</dt>
          <dd>
            {v.device}, {v.os}, {v.browser}
            {v.screen && ` · ${v.screen}`}
          </dd>
        </div>
        <div>
          <dt>Language · time zone</dt>
          <dd>
            {v.lang || '—'} · {v.tz || '—'}
          </dd>
        </div>
        <div>
          <dt>Time on site</dt>
          <dd>
            {duration(v.activeMs)} · {v.pageviews} pages · {v.clicks} clicks
          </dd>
        </div>
        <div>
          <dt>Visitor</dt>
          <dd>
            <strong>{visitorLabel(v)}</strong> · {v.returning ? 'has visited before' : 'first visit'}
          </dd>
        </div>
      </dl>
      <h3 className="dash-subhead">Step by step</h3>
      <ol className="dash-steps">
        {steps
          .filter((s) => s.type !== 'scroll' && s.type !== 'leave')
          .map((s, i) => (
            <Step key={i} step={s} steps={steps} />
          ))}
      </ol>
    </div>
  );
}

// Every visit from the same device, so one device's whole history is in view.
function DeviceVisits({ vid, current }) {
  const { data, loading, error } = useLoad(() => api.visitor(vid), [vid]);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const at = data.visits.findIndex((x) => x.id === current) + 1;
  const numbered = data.visits.find((x) => x.visitorNo) || data.visits[0];
  return (
    <>
      <h3 className="dash-subhead">Visitor {visitorLabel(numbered)}</h3>
      <dl className="dash-facts">
        <div>
          <dt>Number of visits</dt>
          <dd>
            <strong>{data.visitCount}</strong>
            {at ? <span className="dash-muted"> · showing visit {at}</span> : null}
          </dd>
        </div>
        <div>
          <dt>First seen</dt>
          <dd>{when(data.firstSeen)}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{when(data.lastSeen)}</dd>
        </div>
      </dl>
      {data.visitCount > 1 && (
        <ol className="dash-device-visits">
          {data.visits
            .slice()
            .reverse()
            .map((x) => (
              <li key={x.id}>
                {x.id === current ? (
                  <strong>{when(x.start)} · this visit</strong>
                ) : (
                  <Link className="dash-link" to={`?visit=${encodeURIComponent(x.id)}`}>
                    {when(x.start)}
                  </Link>
                )}
                <span className="dash-muted">
                  {' '}
                  · {x.source} · {x.pageviews} page{x.pageviews === 1 ? '' : 's'} · {duration(x.activeMs)}
                  {x.actionNames.filter((a) => ACTIONS[a]).length > 0 && ` · ${x.actionNames.filter((a) => ACTIONS[a]).map((a) => ACTIONS[a]).join(', ')}`}
                </span>
              </li>
            ))}
        </ol>
      )}
    </>
  );
}

function Step({ step, steps }) {
  const time = new Date(step.t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  if (step.type === 'pageview') {
    const leave = steps.find((s) => s.type === 'leave' && s.path === step.path && s.t >= step.t);
    const scroll = steps.find((s) => s.type === 'scroll' && s.path === step.path && s.t >= step.t);
    return (
      <li className="dash-step dash-step--page">
        <span className="dash-step__icon">
          <Icon name="page" />
        </span>
        <div>
          <strong>Opened {pageName(step.path, step.title?.replace(/ \|.*$/, ''))}</strong>
          <span className="dash-muted">
            {time} · {step.path}
            {leave?.ms ? ` · stayed ${duration(leave.ms)}` : ''}
            {scroll?.depth ? ` · scrolled ${scroll.depth}%` : ''}
          </span>
        </div>
      </li>
    );
  }
  if (step.type === 'click') {
    return (
      <li className="dash-step">
        <span className="dash-step__icon">
          <Icon name="click" />
        </span>
        <div>
          <span>
            Clicked <strong>{step.label || step.tag || 'the page'}</strong>
          </span>
          <span className="dash-muted">
            {time}
            {step.href ? ` · ${step.href}` : ''}
          </span>
        </div>
      </li>
    );
  }
  const label = ACTIONS[step.name] || (step.name === 'view_item' ? 'Viewed product' : step.name);
  return (
    <li className="dash-step dash-step--action">
      <span className="dash-step__icon">
        <Icon name="star" />
      </span>
      <div>
        <strong>{label}</strong>
        <span className="dash-muted">
          {time}
          {step.params?.item_name ? ` · ${step.params.item_name}` : ''}
          {step.params?.product ? ` · ${step.params.product}` : ''}
          {step.params?.enquiry_type ? ` · ${step.params.enquiry_type}` : ''}
        </span>
      </div>
    </li>
  );
}
