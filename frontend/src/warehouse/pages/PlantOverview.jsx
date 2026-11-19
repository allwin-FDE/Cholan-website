import { Link } from 'react-router-dom';
import { api } from '../../dashboard/api.js';
import { Badge, Card, ErrorNote, Loading, PageHead, Stat, useLoad } from '../../dashboard/ui.jsx';
import { STATUS } from '../../dashboard/pages/business/Orders.jsx';
import { money, niceDate } from '../../dashboard/pages/business/shared.js';
import NotConnected from '../../dashboard/pages/business/NotConnected.jsx';

// The plant's first screen: what needs doing now. Orders to confirm, pack and
// dispatch, what is on the road, packs running low, goods received that
// still need their bill, and money overdue both ways. Each tile opens the
// page where the work is done.
const today = () => new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

function Tile({ to, label, value, sub, tone }) {
  return (
    <Link to={to} className={`plant-tile${tone ? ` plant-tile--${tone}` : ''}`}>
      <Stat label={label} value={value} sub={sub} />
    </Link>
  );
}

export default function PlantOverview() {
  const orders = useLoad(() => api.sales.orders('open', ''), []);
  const road = useLoad(() => api.sales.deliveries(), []);
  const stock = useLoad(() => api.sales.stock(), []);
  const received = useLoad(() => api.inward.goodsReceived(), []);
  const dues = useLoad(() => api.sales.dues(), []);
  const payables = useLoad(() => api.inward.payables(), []);

  if (orders.error?.code === 'no-database') return <NotConnected title="Today" />;
  const open = orders.data?.orders || [];
  const count = (...statuses) => open.filter((o) => statuses.includes(o.status)).length;
  const onRoad = (road.data?.deliveries || []).filter((d) => d.status === 'dispatched');
  const packs = (stock.data?.stock || []).filter((s) => s.kind === 'finished');
  const empty = packs.filter((s) => s.available <= 0);
  const low = packs.filter((s) => s.low && s.available > 0);
  const unbilled = (received.data?.receipts || []).filter((r) => !r.bill_number);
  const overdueIn = (dues.data?.dues || []).reduce((s, r) => s + (r.overdue_paise || 0), 0);
  const overdueOut = (payables.data?.payables || []).reduce((s, r) => s + (r.overdue_paise || 0), 0);
  const work = open.filter((o) => ['new', 'confirmed', 'packing', 'packed'].includes(o.status)).slice(0, 12);

  return (
    <div className="dash-page">
      <PageHead title="Today" intro={today()} range={false} />
      {orders.error && <ErrorNote error={orders.error} onRetry={orders.reload} />}
      {orders.loading && !orders.data && <Loading />}
      {orders.data && (
        <>
          <div className="dash-stats">
            <Tile to="/warehouse/orders?status=new" label="To confirm" value={String(count('new'))} tone={count('new') ? 'warn' : ''} />
            <Tile to="/warehouse/orders?status=confirmed" label="To pack" value={String(count('confirmed', 'packing'))} />
            <Tile to="/warehouse/delivery" label="Ready to dispatch" value={String(count('packed'))} />
            <Tile to="/warehouse/delivery" label="On the road" value={String(onRoad.length)} sub={onRoad.some((d) => d.days_on_road > 3) ? 'some over 3 days' : ''} />
          </div>
          <div className="dash-stats">
            <Tile to="/warehouse/stock" label="Packs out of stock" value={stock.data ? String(empty.length) : '…'} sub={low.length ? `${low.length} running low` : ''} tone={empty.length ? 'bad' : ''} />
            <Tile to="/warehouse/purchases?tab=received" label="Goods received, no bill yet" value={received.data ? String(unbilled.length) : '…'} />
            <Tile to="/warehouse/payments" label="Customers overdue" value={dues.data ? money(overdueIn) : '…'} tone={overdueIn ? 'warn' : ''} />
            <Tile to="/warehouse/purchases" label="Suppliers overdue" value={payables.data ? money(overdueOut) : '…'} tone={overdueOut ? 'warn' : ''} />
          </div>
          <div className="plant-grid">
            <Card title="Orders to work on" action={<Link className="dash-link" to="/warehouse/orders">All orders</Link>}>
              {work.length ? (
                <table className="dash-table">
                  <tbody>
                    {work.map((o) => (
                      <tr key={o.id}>
                        <td className="dash-nowrap">
                          <Link className="dash-link" to={`/warehouse/orders?order=${o.id}`}>
                            <strong>{o.number}</strong>
                          </Link>
                          <span className="dash-muted dash-block dash-small">{niceDate(o.order_date)}</span>
                        </td>
                        <td>{o.customer}</td>
                        <td>
                          <Badge tone={STATUS[o.status]?.[1]}>{STATUS[o.status]?.[0] || o.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="dash-muted">No orders waiting. New ones from the website, phone and WhatsApp show here.</p>
              )}
            </Card>
            <Card title="Stock to watch" action={<Link className="dash-link" to="/warehouse/stock">All stock</Link>}>
              {stock.loading && !stock.data && <Loading />}
              {stock.data &&
                ([...empty, ...low].length ? (
                  <table className="dash-table">
                    <tbody>
                      {[...empty, ...low].slice(0, 12).map((s) => (
                        <tr key={s.item_id}>
                          <td>
                            <Link className="dash-link" to={`/warehouse/stock?item=${s.item_id}`}>
                              {s.product_name ? `${s.product_name} ${s.pack_label || ''}` : s.name}
                            </Link>
                          </td>
                          <td className="dash-num">{s.available > 0 ? <Badge tone="warn">{s.available} left</Badge> : <Badge tone="bad">Out of stock</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="dash-muted">Every pack has stock.</p>
                ))}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
