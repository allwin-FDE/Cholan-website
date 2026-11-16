import { useMemo, useState } from 'react';
import { api } from '../../dashboard/api.js';
import { periodName, useDash } from '../../dashboard/context.js';
import { BarList, Card, Empty, ErrorNote, Icon, Loading, PageHead, Stat, downloadCsv, duration, num, useLoad } from '../../dashboard/ui.jsx';

// Each product page: how many saw it, how long they stayed, how far they
// scrolled, and how many pressed Enquire, called or messaged from it.
const COLUMNS = [
  { key: 'name', label: 'Product' },
  { key: 'views', label: 'Views' },
  { key: 'visitors', label: 'Visitors' },
  { key: 'reach', label: 'Of all visits', format: (v) => `${v}%` },
  { key: 'avgTimeMs', label: 'Avg time', format: duration },
  { key: 'avgScroll', label: 'Scrolled', format: (v) => `${v}%` },
  { key: 'enquire', label: 'Enquire taps' },
  { key: 'calls', label: 'Calls' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'enquiries', label: 'Enquiries' },
  { key: 'contactRate', label: 'Contact rate', format: (v) => `${v}%` },
];

export default function Products() {
  const { days } = useDash();
  const { data, loading, error, reload } = useLoad(() => api.products(days), [days]);
  const [sort, setSort] = useState({ key: 'views', dir: -1 });
  const products = useMemo(() => data?.products || [], [data]);
  const rows = useMemo(
    () =>
      [...products].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
      }),
    [products, sort],
  );
  const total = (key) => products.reduce((s, p) => s + p[key], 0);

  const csv = () =>
    downloadCsv(`cholan-products-${periodName(days)}.csv`, [
      ['Product', 'Page', ...COLUMNS.slice(1).map((c) => c.label)],
      ...rows.map((p) => [p.name, `/products/${p.id}`, ...COLUMNS.slice(1).map((c) => (c.key === 'avgTimeMs' ? Math.round(p[c.key] / 1000) : p[c.key]))]),
    ]);

  return (
    <div className="dash-page">
      <PageHead
        title="Products"
        intro="Which rice people look at, and which ones bring enquiries"
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={csv} disabled={!rows.length}>
            <Icon name="download" /> Download CSV
          </button>
        }
      />
      {loading && !data && <Loading />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && !products.length && <Empty icon="box" title="No product views yet">Product pages viewed in this period will show here.</Empty>}
      {products.length > 0 && (
        <>
          <div className="dash-stats">
            <Stat label="Product views" value={num(total('views'))} sub={`${products.length} products seen`} icon="eye" />
            <Stat label="Enquire taps" value={num(total('enquire'))} sub="Enquire pressed on a product" icon="mail" />
            <Stat label="Calls & WhatsApp" value={num(total('calls') + total('whatsapp'))} sub="from product pages" icon="phone" />
            <Stat label="Enquiries" value={num(total('enquiries'))} sub="sent after seeing a product" icon="check" />
          </div>
          <div className="dash-grid dash-grid--2">
            <Card title="Most viewed">
              <BarList items={products.map((p) => ({ name: p.name, value: p.views }))} />
            </Card>
            <Card title="Most enquired" hint="Enquire taps, calls, WhatsApp and enquiries">
              <BarList
                items={products
                  .map((p) => ({ name: p.name, value: p.enquire + p.calls + p.whatsapp + p.enquiries }))
                  .filter((p) => p.value)
                  .sort((a, b) => b.value - a.value)}
                empty="No one has asked about a product yet in this period."
              />
            </Card>
          </div>
          <Card title="Every product" hint="Click a column to sort">
            <div className="dash-table-wrap">
              <table className="dash-table dash-table--num">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.key}>
                        <button
                          type="button"
                          className="an-sort"
                          onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : c.key === 'name' ? 1 : -1 }))}
                        >
                          {c.label}
                          {sort.key === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      {COLUMNS.map((c) => (
                        <td key={c.key}>
                          {c.key === 'name' ? (
                            <a className="dash-link" href={`/products/${p.id}`} target="_blank" rel="noreferrer">
                              {p.name}
                            </a>
                          ) : c.format ? (
                            c.format(p[c.key])
                          ) : (
                            num(p[c.key])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
