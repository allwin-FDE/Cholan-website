import { useMemo } from 'react';
import { api } from '../../dashboard/api.js';
import { useUrlSearch } from '../../dashboard/urlState.js';
import { periodName, useDash } from '../../dashboard/context.js';
import { Card, Empty, ErrorNote, Icon, Loading, PageHead, Stat, downloadCsv, num, pageName, useLoad } from '../../dashboard/ui.jsx';

// How far down each page people scroll: of the visits that opened a page,
// the share that reached a quarter, half, three quarters and the end.
export default function ScrollDepth() {
  const { days } = useDash();
  const { data, loading, error, reload } = useLoad(() => api.scroll(days), [days]);
  const [q, setQ] = useUrlSearch();
  const pages = useMemo(() => (data?.pages || []).filter((p) => p.measured > 0), [data]);
  const shown = pages.filter((p) => !q || `${p.path} ${p.title}`.toLowerCase().includes(q.toLowerCase()));
  const avg = pages.length ? Math.round(pages.reduce((s, p) => s + p.avg * p.measured, 0) / pages.reduce((s, p) => s + p.measured, 0)) : 0;
  const toEnd = pages.length
    ? Math.round(pages.reduce((s, p) => s + p.reach[3].share * p.measured, 0) / pages.reduce((s, p) => s + p.measured, 0))
    : 0;

  const csv = () =>
    downloadCsv(`cholan-scroll-depth-${periodName(days)}.csv`, [
      ['Page', 'Title', 'Views', 'Measured visits', 'Average depth %', 'Reached 25%', 'Reached 50%', 'Reached 75%', 'Reached the end'],
      ...pages.map((p) => [p.path, p.title, p.views, p.measured, p.avg, ...p.reach.map((r) => r.share)]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Scroll depth"
        intro="How far down each page people read"
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={csv} disabled={!pages.length}>
            <Icon name="download" /> Download CSV
          </button>
        }
      />
      {loading && !data && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && !pages.length && <Empty icon="down" title="No scrolling measured yet">Pages people scroll in this period will show here.</Empty>}
      {pages.length > 0 && (
        <>
          <div className="dash-stats">
            <Stat label="Average depth" value={`${avg}%`} sub="across all pages" icon="down" />
            <Stat label="Read to the end" value={`${toEnd}%`} sub="of page views" icon="check" />
            <Stat label="Pages measured" value={num(pages.length)} icon="file" />
          </div>
          <Card
            title="Every page"
            hint="Share of visits that reached each point of the page"
            action={
              <label className="dash-search an-search an-search--sm">
                <Icon name="search" />
                <input className="dash-input" type="search" placeholder="Find a page" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            }
          >
            <div className="an-depth">
              <div className="an-depth__row an-depth__row--head">
                <span>Page</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>End</span>
                <span>Avg</span>
              </div>
              {shown.map((p) => (
                <div key={p.path} className="an-depth__row">
                  <span className="an-depth__page">
                    <strong>{pageName(p.path, p.title)}</strong>
                    <span className="dash-muted">
                      {p.path} · {num(p.measured)} visit{p.measured === 1 ? '' : 's'}
                    </span>
                  </span>
                  {p.reach.map((r) => (
                    <span key={r.depth} className="an-depth__cell" style={{ '--share': `${r.share}%` }} title={`${r.share}% reached ${r.depth}%`}>
                      {r.share}%
                    </span>
                  ))}
                  <span className="an-depth__avg">{p.avg}%</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
