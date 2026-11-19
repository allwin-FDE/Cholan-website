import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api.js';
import { useDash } from '../../shared/context.js';
import { BarList, Card, ErrorNote, Loading, PageHead, Stat, ago, num, pageName, useLoad } from '../../shared/ui.jsx';

// Who is on the site now: active in the last 5 minutes, and everything in
// the last 30. Refreshes itself every 15 seconds while the page is open.
const EVERY_MS = 15_000;
const WHAT = { pageview: 'Opened', click: 'Clicked', scroll: 'Scrolled', event: '' };

export default function Realtime() {
  const { base } = useDash();
  const { data, error, reload } = useLoad(() => api.realtime(), []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [reload]);
  const top = Math.max(1, ...(data?.minutes || []).map((m) => m.value));

  return (
    <div className="dash-page">
      <PageHead title="Realtime" intro="Who is on the website right now. Updates every 15 seconds." range={false} />
      {!data && !error && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="dash-stats">
            <div className="dash-stat an-live">
              <span className="dash-stat__label">
                <span className="an-live__dot" aria-hidden="true" /> Active now
              </span>
              <span className="dash-stat__value">{num(data.activeNow)}</span>
              <span className="dash-stat__sub">in the last 5 minutes</span>
            </div>
            <Stat label="Visits" value={num(data.last30)} sub="last 30 minutes" icon="users" />
            <Stat label="Page views" value={num(data.pageviews30)} sub="last 30 minutes" icon="eye" />
          </div>
          <Card title="Page views per minute" hint="The last 30 minutes, now on the right">
            <div className="an-minutes" role="img" aria-label="Page views per minute">
              {data.minutes.map((m) => (
                <span key={m.ago} title={`${m.value} page view${m.value === 1 ? '' : 's'}, ${m.ago} min ago`}>
                  <span style={{ height: `${(m.value / top) * 100}%` }} />
                </span>
              ))}
            </div>
          </Card>
          <div className="dash-grid dash-grid--3">
            <Card title="Pages open now">
              <BarList items={data.pagesNow} labelOf={(p) => pageName(p.name)} empty="No one is on the site right now." />
            </Card>
            <Card title="Came from">
              <BarList items={data.sources} empty="No visits in the last 30 minutes." />
            </Card>
            <Card title="Devices">
              <BarList items={data.devices} empty="No visits in the last 30 minutes." />
            </Card>
          </div>
          <div className="dash-grid dash-grid--2">
            <Card title="Visitors in the last 30 minutes">
              {!data.visits.length && <p className="dash-muted">No visits in the last 30 minutes.</p>}
              <ul className="an-feed">
                {data.visits.map((v) => (
                  <li key={v.id}>
                    <span className={`an-live__dot${v.activeNow ? '' : ' is-idle'}`} aria-hidden="true" />
                    <Link className="dash-link" to={`${base}/visitors?visit=${v.id}`}>
                      {v.visitorNo ? `V-${v.visitorNo}` : `#${(v.vid || v.id).slice(0, 6)}`}
                    </Link>
                    <span>on {pageName(v.page)}</span>
                    <span className="dash-muted">
                      {v.device} · {v.source} · {ago(v.last)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Live activity">
              {!data.feed.length && <p className="dash-muted">Nothing in the last 30 minutes.</p>}
              <ul className="an-feed">
                {data.feed.map((e, i) => (
                  <li key={`${e.t}-${i}`}>
                    <span className="dash-muted an-feed__time">{ago(e.t)}</span>
                    <span>
                      {e.type === 'event' ? e.label : `${WHAT[e.type]} ${e.type === 'click' && e.label ? `“${e.label}”` : e.type === 'scroll' ? `to ${e.depth}%` : ''}`}
                    </span>
                    <span className="dash-muted">{pageName(e.path)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
