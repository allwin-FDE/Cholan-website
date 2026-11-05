import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

  const list = useMemo(() => {
    if (!data) return [];
    const q = filters.q.toLowerCase();
    return data.visits.filter(
      (v) =>
        (!filters.device || v.device === filters.device) &&
        (!filters.source || v.source === filters.source) &&
        (!filters.action || v.actionNames.includes(filters.action)) &&
        (!q || [v.source, v.landing, v.referrer, v.campaign, v.os, v.browser, ...v.pages].join(' ').toLowerCase().includes(q)),
    );
  }, [data, filters]);

  const options = (key) => [...new Set((data?.visits || []).map((v) => v[key]).filter(Boolean))].sort();

  const exportCsv = () =>
    downloadCsv(`cholan-visits-${days}d.csv`, [
      ['Started', 'Source', 'Campaign', 'Landing page', 'Pages', 'Device', 'OS', 'Browser', 'Screen', 'Language', 'Time on site (s)', 'Clicks', 'Actions', 'Returning'],
      ...list.map((v) => [
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
        v.actionNames.join(' '),
        v.returning ? 'yes' : 'no',
      ]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Visitors"
        intro="Every visit, newest first. Click a visit to see the whole journey, step by step."
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
            <Icon name="download" /> Export
          </button>
        }
      />
      <div className="dash-filters">
        <label className="dash-search">
          <Icon name="search" />
          <input placeholder="Search pages, sources, campaigns…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
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
      {data && !list.length && <Empty icon="users" title="No visits match">Try a longer period or clear the filters.</Empty>}
      {list.length > 0 && (
        <Card>
          <p className="dash-muted dash-count">
            {list.length} visit{list.length === 1 ? '' : 's'}
          </p>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Came from</th>
                  <th>Journey</th>
                  <th>Device</th>
                  <th>Time</th>
                  <th>Did</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 500).map((v) => (
                  <tr key={v.id} className="dash-row-link" onClick={() => setParams({ visit: v.id })}>
                    <td className="dash-nowrap">
                      {when(v.start)}
                      {v.returning && <Badge tone="info">returning</Badge>}
                    </td>
                    <td>
                      {v.source}
                      {v.campaign && <span className="dash-muted"> · {v.campaign}</span>}
                    </td>
                    <td className="dash-journey-cell">{v.pages.map((p) => pageName(p)).join(' → ') || pageName(v.landing)}</td>
                    <td className="dash-nowrap">
                      {v.device} · {v.os}
                    </td>
                    <td className="dash-nowrap">{duration(v.activeMs)}</td>
                    <td>
                      {v.actionNames
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
      <Drawer open={Boolean(openId)} onClose={() => setParams({})} title="Visit journey" wide>
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
          <dd>{v.returning ? 'Has visited before' : 'First visit'}</dd>
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
