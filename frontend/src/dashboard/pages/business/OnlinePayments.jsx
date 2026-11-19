import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, Card, ErrorNote, Loading, PageHead, ago, useLoad, when } from '../../ui.jsx';
import NotConnected from './NotConnected.jsx';

const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const PAY = {
  created: ['Waiting for payment', 'warn'],
  paid: ['Paid', 'good'],
  expired: ['Not paid in time', 'muted'],
  paid_late: ['Paid after it expired: refund or re-take', 'bad'],
  refunded: ['Refunded', 'muted'],
};

// Website orders paid online with Razorpay: switching it on or off, each
// online order and its payment, and refunds. Payments confirm orders by
// themselves; nothing here needs doing for a normal paid order.
export default function OnlinePayments() {
  const { allowed } = useDash();
  const { data, loading, error, reload, setData } = useLoad(() => api.accounts.online(), []);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState(null);

  if (error?.code === 'no-database') return <NotConnected title="Online payments" />;
  const status = data?.status;

  const toggle = async () => {
    const on = !status.switchedOn;
    if (on && status.liveKeys && !window.confirm('These are LIVE Razorpay keys: real money will be taken. Switch online payment on?')) return;
    setBusy('switch');
    setProblem(null);
    try {
      const r = await api.accounts.switchOnline(on);
      setData({ ...data, status: r.status });
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy('');
    }
  };
  const refund = async (o) => {
    const reason = window.prompt(`Refund ${rupees(o.amount_paise)} to ${o.customer} for ${o.number}? The order is cancelled and the bags go back to stock.\n\nReason:`);
    if (!reason) return;
    setBusy(o.order_id);
    setProblem(null);
    try {
      await api.accounts.refund(o.order_id, reason);
      reload();
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="dash-page">
      <PageHead title="Online payments" intro="Website orders paid with Razorpay (UPI, card, netbanking). A paid order confirms itself; one not paid in 30 minutes is cancelled and its bags released." range={false} />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {problem && <div className="dash-error">{problem.message}</div>}
      {status && (
        <Card title="Taking online payment">
          <dl className="dash-facts">
            <div>
              <dt>Online payment</dt>
              <dd>{status.enabled ? <Badge tone="good">On</Badge> : <Badge tone="muted">Off</Badge>}</dd>
            </div>
            <div>
              <dt>Razorpay keys on the server</dt>
              <dd>{status.keysSet ? (status.liveKeys ? <Badge tone="warn">Live keys</Badge> : <Badge tone="info">Test keys</Badge>) : <Badge tone="bad">Not set</Badge>}</dd>
            </div>
            <div>
              <dt>Unpaid orders cancelled after</dt>
              <dd>{status.expiryMinutes} minutes</dd>
            </div>
          </dl>
          {!status.keysSet && (
            <p className="dash-muted dash-small">The Razorpay keys go in Google Secret Manager for the server (never in the code). Test them with Razorpay test keys before switching on.</p>
          )}
          <p className="dash-muted dash-small">
            Customers also need the cart on the website, which is switched off since 14 November (Enquire only). Ask to turn it back on when you are ready to take orders online.
          </p>
          {allowed('admin') && (
            <button type="button" className={`dash-btn dash-btn--sm${status.switchedOn ? ' dash-btn--danger' : ''}`} disabled={busy === 'switch' || (!status.switchedOn && !status.keysSet)} onClick={toggle} style={{ marginTop: 10 }}>
              {busy === 'switch' ? 'Saving…' : status.switchedOn ? 'Switch online payment off' : 'Switch online payment on'}
            </button>
          )}
        </Card>
      )}
      {data && (
        <Card title="Online orders">
          {!data.orders.length && <p className="dash-muted">No online orders yet.</p>}
          {data.orders.length > 0 && (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th className="dash-num">Amount</th>
                    <th>Payment</th>
                    <th>Order status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => {
                    const [label, tone] = PAY[o.pay_status] || [o.pay_status, 'neutral'];
                    return (
                      <tr key={o.rp_order_id}>
                        <td>
                          <Link className="dash-link" to={`/admin/business/orders?open=${o.order_id}`}>
                            {o.number}
                          </Link>
                          <span className="dash-muted dash-block dash-small" title={when(o.created_at)}>
                            {ago(o.created_at)}
                          </span>
                        </td>
                        <td>
                          {o.customer}
                          <span className="dash-muted dash-block dash-small">{o.phone}</span>
                        </td>
                        <td className="dash-num">{rupees(o.amount_paise)}</td>
                        <td>
                          <Badge tone={tone}>{label}</Badge>
                          {o.rp_payment_id && <span className="dash-muted dash-block dash-small">{o.rp_payment_id}</span>}
                        </td>
                        <td>{o.status}</td>
                        <td>
                          {allowed('admin') && ['paid', 'paid_late'].includes(o.pay_status) && !['dispatched', 'delivered', 'returned'].includes(o.status) && (
                            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" disabled={busy === o.order_id} onClick={() => refund(o)}>
                              {busy === o.order_id ? 'Refunding…' : 'Refund'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

