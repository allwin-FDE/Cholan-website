import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, ErrorNote, Icon, Loading, Stat, dateOnly, downloadCsv, when } from '../../dashboard/ui.jsx';
import { METHODS, WhHead, rupees, useLive, wh } from '../shared.jsx';

export default function Payments() {
  const [tab, setTab] = useState('due');
  const paid = useLive(() => wh.get('/payments'));
  const open = useLive(() => wh.get('/orders'));
  const error = paid.error || open.error;
  const due = useMemo(
    () => (open.data?.orders || []).filter((o) => !['cancelled', 'returned'].includes(o.status) && o.totalPaise > (o.paidPaise || 0)),
    [open.data],
  );
  const totalDue = due.reduce((sum, o) => sum + o.totalPaise - (o.paidPaise || 0), 0);
  const live = (paid.data?.payments || []).filter((p) => !p.reversed);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotal = live.filter((p) => p.at.startsWith(thisMonth)).reduce((sum, p) => sum + p.amountPaise, 0);

  const exportCsv = () =>
    tab === 'due'
      ? downloadCsv('cholan-money-due.csv', [
          ['Order', 'Date', 'Customer', 'Phone', 'Total', 'Paid', 'Due'],
          ...due.map((o) => [o.number, dateOnly(o.createdAt), o.customer.name, o.customer.phone, o.totalPaise / 100, (o.paidPaise || 0) / 100, (o.totalPaise - (o.paidPaise || 0)) / 100]),
        ])
      : downloadCsv('cholan-payments.csv', [
          ['Date', 'Order', 'Customer', 'Phone', 'Amount', 'Method', 'Reference', 'By', 'Reversed', 'Reason'],
          ...(paid.data?.payments || []).map((p) => [dateOnly(p.at), p.orderNumber, p.customerName, p.customerPhone, p.amountPaise / 100, METHODS[p.method], p.reference, p.by, p.reversed ? 'Yes' : '', p.reverseReason || '']),
        ]);

  return (
    <div className="dash-page">
      <WhHead
        title="Payments"
        actions={
          <>
            <div className="dash-seg" role="group" aria-label="View">
              {[['due', 'Money due'], ['received', 'Received']].map(([key, label]) => (
                <button key={key} type="button" className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv}>
              <Icon name="download" /> Export
            </button>
          </>
        }
      />
      {error && <ErrorNote error={error} onRetry={paid.reload} />}
      {!paid.data && !error && <Loading />}
      <div className="dash-grid dash-grid--2 wh-gap-below">
        <Stat icon="inbox" label="Money due" value={rupees(totalDue)} sub={`${due.length} open ${due.length === 1 ? 'order' : 'orders'}`} />
        <Stat icon="star" label="Received this month" value={rupees(monthTotal)} />
      </div>
      <Card>
        <div className="dash-table-wrap">
          {tab === 'due' ? (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {due.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/warehouse/orders/${o.id}`}>{o.number}</Link>
                    </td>
                    <td>
                      {o.customer.name}
                      <br />
                      <small className="dash-muted">{o.customer.phone}</small>
                    </td>
                    <td>{rupees(o.totalPaise)}</td>
                    <td>{rupees(o.paidPaise)}</td>
                    <td>
                      <strong>{rupees(o.totalPaise - (o.paidPaise || 0))}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>How</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {(paid.data?.payments || []).map((p) => (
                  <tr key={p.id} className={p.reversed ? 'wh-struck' : ''}>
                    <td>{when(p.at)}</td>
                    <td>
                      <Link to={`/warehouse/orders/${p.orderId}`}>{p.orderNumber}</Link>
                    </td>
                    <td>{p.customerName}</td>
                    <td>
                      {rupees(p.amountPaise)} {p.reversed && <Badge tone="muted">Reversed</Badge>}
                    </td>
                    <td>
                      {METHODS[p.method]}
                      {p.reference && ` · ${p.reference}`}
                    </td>
                    <td>{p.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {tab === 'due' && open.data && !due.length && <p className="dash-muted">Nothing is due.</p>}
        {tab === 'received' && paid.data && !paid.data.payments.length && <p className="dash-muted">No payments yet.</p>}
      </Card>
    </div>
  );
}
