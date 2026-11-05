import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useDash } from '../context.js';
import { Card, Empty, ErrorNote, Icon, Loading, PageHead, downloadCsv, duration, num, pageName, useLoad } from '../ui.jsx';

const COLUMNS = [
  { key: 'views', label: 'Views', format: num, hint: 'Times the page was opened' },
  { key: 'visitors', label: 'Visitors', format: num, hint: 'Different people who opened it' },
  { key: 'avgTimeMs', label: 'Avg. time', format: duration, hint: 'Time spent on the page, while visible' },
  { key: 'avgScroll', label: 'Scrolled', format: (v) => `${v}%`, hint: 'How far down people got, on average' },
  { key: 'clicks', label: 'Clicks', format: num, hint: 'Clicks and taps on the page' },
  { key: 'exitRate', label: 'Left here', format: (v) => `${v}%`, hint: 'Share of views that ended the visit' },
];

export default function PagesReport() {
  const { days } = useDash();
  const [sort, setSort] = useState('views');
  const { data, loading, error, reload } = useLoad(() => api.pages(days), [days]);
  const pages = useMemo(() => [...(data?.pages || [])].sort((a, b) => b[sort] - a[sort]), [data, sort]);

  const exportCsv = () =>
    downloadCsv(`cholan-pages-${days}d.csv`, [
      ['Page', 'Path', ...COLUMNS.map((c) => c.label)],
      ...pages.map((p) => [pageName(p.path, p.title), p.path, p.views, p.visitors, Math.round(p.avgTimeMs / 1000), p.avgScroll, p.clicks, p.exitRate]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Pages"
        intro="How each page performs. Click a column to sort; open a heatmap to see where people click."
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!pages.length}>
            <Icon name="download" /> Export
          </button>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && !pages.length && <Empty icon="file" title="No page views in this period" />}
      {pages.length > 0 && (
        <Card>
          <div className="dash-table-wrap">
            <table className="dash-table dash-table--num">
              <thead>
                <tr>
                  <th>Page</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} title={c.hint}>
                      <button type="button" className={`dash-sort${sort === c.key ? ' is-on' : ''}`} onClick={() => setSort(c.key)}>
                        {c.label}
                        {sort === c.key && ' ↓'}
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.path}>
                    <td>
                      <strong>{pageName(p.path, p.title)}</strong>
                      <span className="dash-muted dash-block">{p.path}</span>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key}>{c.format(p[c.key])}</td>
                    ))}
                    <td>
                      <Link className="dash-link dash-nowrap" to={`/dashboard/heatmaps?path=${encodeURIComponent(p.path)}`}>
                        Heatmap →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
