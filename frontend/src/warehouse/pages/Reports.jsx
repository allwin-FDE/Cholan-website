import { useMemo, useState } from 'react';
import { Card, ErrorNote, Icon, Loading, Stat, downloadCsv, num, useLoad } from '../../dashboard/ui.jsx';
import { WhHead, bags, rupees, wh } from '../shared.jsx';

const PERIODS = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']];
const india = (iso) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function group(orders, keysOf) {
  const rows = new Map();
  for (const order of orders) {
    for (const { key, label, qty, paise } of keysOf(order)) {
      const row = rows.get(key) || { key, label, qty: 0, paise: 0, orders: new Set() };
      row.qty += qty;
      row.paise += paise;
      row.orders.add(order.number);
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

function Table({ title, rows, first, onExport }) {
  return (
    <Card
      title={title}
      className="wh-gap"
      action={
        <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={onExport} disabled={!rows.length}>
          <Icon name="download" /> Export
        </button>
      }
    >
      {rows.length ? (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>{first}</th>
                <th>Orders</th>
                <th>Bags</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td>{num(row.orders.size)}</td>
                  <td>{num(row.qty)}</td>
                  <td>{rupees(row.paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dash-muted">No orders in this period.</p>
      )}
    </Card>
  );
}

const csvRows = (first, rows) => [[first, 'Orders', 'Bags', 'Value'], ...rows.map((r) => [r.label, r.orders.size, r.qty, r.paise / 100])];

// Values are the price of the bags on each order, before cancelled and returned ones.
export default function Reports() {
  const [days, setDays] = useState(30);
  const { data, error, reload } = useLoad(() => wh.get('/orders?limit=3000'), []);
  const orders = useMemo(() => {
    const since = Date.now() - days * 86400000;
    return (data?.orders || []).filter((o) => Date.parse(o.createdAt) >= since);
  }, [data, days]);
  const counted = orders.filter((o) => !['cancelled', 'returned'].includes(o.status));

  const byProduct = group(counted, (o) => o.items.map((i) => ({ key: `${i.productId}|${i.pack}`, label: `${i.name} ${i.pack}`, qty: i.qty, paise: i.unitPaise * i.qty }))).sort((a, b) => b.paise - a.paise || b.qty - a.qty);
  const byDay = group(counted, (o) => [{ key: india(o.createdAt), label: india(o.createdAt), qty: bags(o.items), paise: o.totalPaise }]).sort((a, b) => b.key.localeCompare(a.key));
  const byCustomer = group(counted, (o) => [{ key: o.customer.phone, label: `${o.customer.name} · ${o.customer.phone}`, qty: bags(o.items), paise: o.totalPaise }]).sort((a, b) => b.paise - a.paise);

  const value = counted.reduce((sum, o) => sum + (o.totalPaise || 0), 0);
  const sent = counted.filter((o) => ['dispatched', 'delivered'].includes(o.status));

  return (
    <div className="dash-page">
      <WhHead
        title="Reports"
        actions={
          <div className="dash-seg" role="group" aria-label="Period">
            {PERIODS.map(([key, label]) => (
              <button key={key} type="button" className={days === key ? 'is-on' : ''} onClick={() => setDays(key)}>
                {label}
              </button>
            ))}
          </div>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="dash-grid dash-grid--3">
            <Stat icon="star" label="Order value" value={rupees(value)} sub={`${counted.length} orders, not counting cancelled or returned`} />
            <Stat icon="check" label="Bags dispatched" value={num(sent.reduce((sum, o) => sum + bags(o.items), 0))} sub={`on ${sent.length} orders`} />
            <Stat icon="inbox" label="Cancelled or returned" value={num(orders.length - counted.length)} />
          </div>
          <Table title="By product" first="Product" rows={byProduct} onExport={() => downloadCsv('cholan-sales-by-product.csv', csvRows('Product', byProduct))} />
          <Table title="By day" first="Date" rows={byDay} onExport={() => downloadCsv('cholan-sales-by-day.csv', csvRows('Date', byDay))} />
          <Table title="By customer" first="Customer" rows={byCustomer} onExport={() => downloadCsv('cholan-sales-by-customer.csv', csvRows('Customer', byCustomer))} />
        </>
      )}
    </div>
  );
}
