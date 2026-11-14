import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useDash } from '../context.js';
import {
  BarList,
  Card,
  DailyChart,
  Empty,
  ErrorNote,
  HourChart,
  Icon,
  Loading,
  PageHead,
  Stat,
  ago,
  duration,
  num,
  pageName,
  useLoad,
} from '../ui.jsx';

export default function Overview() {
  const { days } = useDash();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(() => api.overview(days), [days]);

  return (
    <div className="dash-page">
      <PageHead
        title="Overview"
        intro="How people find and use the website. Counts visitors who accepted cookies."
        actions={
          <button type="button" className="dash-icon-btn" onClick={reload} title="Refresh" aria-label="Refresh">
            <Icon name="refresh" />
          </button>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.kpis.visits === 0 && (
        <Empty icon="users" title="No visits recorded in this period yet">
          Visits appear here once people accept cookies on the website. Try a longer period, or open the website, accept
          cookies and come back in a minute.
        </Empty>
      )}
      {data && data.kpis.visits > 0 && <OverviewBody data={data} onVisit={(id) => navigate(`/admin/visitors?visit=${id}`)} />}
    </div>
  );
}

function OverviewBody({ data, onVisit }) {
  const k = data.kpis;
  const pages = data.pages.map((p) => ({ name: p.path, value: p.views, title: p.title }));
  return (
    <>
      <div className="dash-stats">
        <Stat icon="users" label="Visitors" value={num(k.visitors)} sub={`${k.returningRate}% came back again`} />
        <Stat
          icon="page"
          label="Visits"
          value={num(k.visits)}
          sub={`${k.pagesPerVisit} pages per visit${k.anonVisits ? ` · + ${num(k.anonVisits)} with tracking turned off` : ''}`}
        />
        <Stat icon="eye" label="Page views" value={num(k.pageviews)} sub={`${k.bounceRate}% left after one page`} />
        <Stat icon="clock" label="Avg. time on site" value={duration(k.avgTimeMs)} sub="per visit, while the tab was open" />
        <Stat icon="inbox" label="Enquiries sent" value={num(k.enquiries)} sub="from the contact form" />
        <Stat icon="phone" label="Calls & WhatsApp" value={num(k.calls + k.whatsapp)} sub={`${num(k.calls)} calls · ${num(k.whatsapp)} WhatsApp`} />
      </div>

      <Card title="Visits per day" hint="Hover over the chart to see each day.">
        <DailyChart data={data.daily} />
      </Card>

      <div className="dash-grid dash-grid--3">
        <Card title="Where visitors come from" hint="Search engines, social media, other sites, or typed in directly.">
          <BarList items={data.sources} />
        </Card>
        <Card title="Devices">
          <BarList items={data.devices} />
          <h3 className="dash-subhead">Browsers</h3>
          <BarList items={data.browsers} max={5} />
        </Card>
        <Card title="Actions taken" hint="The taps that bring you customers.">
          <BarList items={data.actions} labelOf={(a) => a.label} empty="No actions yet." />
        </Card>
      </div>

      <div className="dash-grid dash-grid--2">
        <Card title="Most viewed pages" action={<Link className="dash-link" to="/admin/pages">All pages →</Link>}>
          <BarList items={pages} labelOf={(p) => pageName(p.name, p.title)} />
        </Card>
        <Card title="Products people looked at" hint="Product pages opened, most first.">
          <BarList items={data.products} empty="No product pages viewed yet." />
        </Card>
      </div>

      <div className="dash-grid dash-grid--2">
        <Card title="Busiest hours" hint="When visits start, India time. Good times to post on social media.">
          <HourChart hours={data.hours} />
        </Card>
        <Card title="First page of each visit" hint="Where people land when they arrive.">
          <BarList items={data.landing} labelOf={(p) => pageName(p.name)} />
        </Card>
      </div>

      <div className="dash-grid dash-grid--3">
        <Card title="Operating systems">
          <BarList items={data.os} max={6} />
        </Card>
        <Card title="Languages" hint="From each visitor’s browser setting.">
          <BarList items={data.languages} max={6} labelOf={(l) => LANG[l.name] || l.name} />
        </Card>
        <Card title="Time zones" hint="A rough idea of where visitors are.">
          <BarList items={data.regions} max={6} />
        </Card>
      </div>

      {data.campaigns.length > 0 && (
        <Card title="Campaigns" hint="Visits from links tagged with utm_campaign (ads, WhatsApp broadcasts, posts).">
          <BarList items={data.campaigns} />
        </Card>
      )}

      <Card title="Latest visits" action={<Link className="dash-link" to="/admin/visitors">All visitors →</Link>}>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>When</th>
                <th>From</th>
                <th>Device</th>
                <th>Pages</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((v) => (
                <tr key={v.id} className="dash-row-link" onClick={() => onVisit(v.id)}>
                  <td>{ago(v.start)}</td>
                  <td>{v.source}</td>
                  <td>
                    {v.device} · {v.os}
                  </td>
                  <td>{v.pageviews}</td>
                  <td>{duration(v.activeMs)}</td>
                  <td>{v.actionNames.filter((a) => a !== 'view_item').join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

const LANG = { en: 'English', ta: 'Tamil', hi: 'Hindi', ml: 'Malayalam', te: 'Telugu', kn: 'Kannada' };
