import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../dashboard/api.js';
import { useDash } from '../../dashboard/context.js';
import { Badge, Card, ErrorNote, Icon, Loading, PageHead, Stat, useLoad, when } from '../../dashboard/ui.jsx';
import { money, niceDate, phoneShow } from '../../dashboard/pages/business/shared.js';
import NotConnected from '../../dashboard/pages/business/NotConnected.jsx';

// The delivery board: bags packed and waiting for a vehicle, orders on the
// road (with the vehicle, driver and LR), and what was delivered this week.
// Dispatching is done on the order (it records the vehicle and makes the
// invoice); here a delivered order is ticked off when the driver confirms.
const GROUPS = [
  { status: 'packed', title: 'Ready to dispatch', empty: 'Nothing packed and waiting.' },
  { status: 'dispatched', title: 'On the road', empty: 'Nothing on the road.' },
  { status: 'delivered', title: 'Delivered in the last 7 days', empty: 'Nothing delivered this week.' },
];
const place = (shipTo) => (shipTo ? [shipTo.city, shipTo.pincode].filter(Boolean).join(' ') : 'Pickup');
const orderLink = (id, step) => `/warehouse/orders?status=all&order=${id}${step ? `&step=${step}` : ''}`;
const Phone = ({ value }) => (value ? <a href={`tel:${value}`} className="dash-link">{phoneShow(value)}</a> : null);

export default function Delivery() {
  const { allowed } = useDash();
  const list = useLoad(() => api.sales.deliveries(), []);
  const [busy, setBusy] = useState(null);

  if (list.error?.code === 'no-database') return <NotConnected title="Delivery" />;
  const rows = list.data?.deliveries || [];
  const of = (status) => rows.filter((r) => r.status === status);
  const delivered = async (r) => {
    if (!window.confirm(`Mark ${r.number} for ${r.customer} as delivered?`)) return;
    setBusy(r.id);
    try {
      await api.sales.move(r.id, 'delivered');
      list.reload();
    } catch (e) {
      window.alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dash-page">
      <PageHead
        title="Delivery"
        intro="Packed orders waiting for a vehicle, orders on the road and what was delivered this week. Dispatch from the order, so the vehicle and driver are recorded and the invoice is made."
        range={false}
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={list.reload}>
            <Icon name="refresh" /> Refresh
          </button>
        }
      />
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <>
          <div className="dash-stats">
            <Stat label="Ready to dispatch" value={String(of('packed').length)} sub={`${of('packed').reduce((s, r) => s + (r.bags || 0), 0)} bags`} />
            <Stat label="On the road" value={String(of('dispatched').length)} sub={`${of('dispatched').reduce((s, r) => s + (r.bags || 0), 0)} bags`} />
            <Stat label="Delivered this week" value={String(of('delivered').length)} />
            <Stat label="To collect on delivery" value={money(of('dispatched').reduce((s, r) => s + (r.balance_paise || 0), 0))} />
          </div>
          {GROUPS.map((g) => (
            <Card key={g.status} title={`${g.title} (${of(g.status).length})`}>
              {of(g.status).length ? (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Deliver to</th>
                        <th className="dash-num">Bags</th>
                        {g.status !== 'packed' && <th>Vehicle and driver</th>}
                        <th className="dash-num">Unpaid</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {of(g.status).map((r) => (
                        <tr key={r.id}>
                          <td className="dash-nowrap">
                            <Link to={orderLink(r.id)} className="dash-link">
                              <strong>{r.number}</strong>
                            </Link>
                            <span className="dash-muted dash-block dash-small">{r.invoice_number || niceDate(r.order_date)}</span>
                          </td>
                          <td>
                            {r.customer}
                            <span className="dash-block dash-small">
                              <Phone value={r.phone} />
                            </span>
                          </td>
                          <td className="dash-small">{place(r.ship_to)}</td>
                          <td className="dash-num">{r.bags}</td>
                          {g.status !== 'packed' && (
                            <td className="dash-small">
                              {[r.vehicle_no, r.driver_name].filter(Boolean).join(' · ') || <span className="dash-muted">Not recorded</span>}
                              {r.driver_phone && (
                                <span className="dash-block">
                                  <Phone value={r.driver_phone} />
                                </span>
                              )}
                              {(r.transporter || r.lr_no) && <span className="dash-muted dash-block">{[r.transporter, r.lr_no && `LR ${r.lr_no}`].filter(Boolean).join(' · ')}</span>}
                              {r.eway_bill_no && <span className="dash-muted dash-block">E-way {r.eway_bill_no}</span>}
                            </td>
                          )}
                          <td className="dash-num">{r.balance_paise ? money(r.balance_paise) : ''}</td>
                          <td className="dash-nowrap">
                            {g.status === 'packed' && allowed('editor') && (
                              <Link to={orderLink(r.id, 'dispatch')} className="dash-btn dash-btn--sm">
                                Dispatch
                              </Link>
                            )}
                            {g.status === 'dispatched' && (
                              <>
                                {r.days_on_road > 1 && <Badge tone={r.days_on_road > 3 ? 'bad' : 'warn'}>{r.days_on_road} days</Badge>}{' '}
                                {allowed('editor') && (
                                  <button type="button" className="dash-btn dash-btn--sm" disabled={busy === r.id} onClick={() => delivered(r)}>
                                    {busy === r.id ? 'Saving…' : 'Delivered'}
                                  </button>
                                )}
                              </>
                            )}
                            {g.status === 'delivered' && <span className="dash-muted dash-small">{r.delivered_at ? when(r.delivered_at) : ''}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dash-muted">{g.empty}</p>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
