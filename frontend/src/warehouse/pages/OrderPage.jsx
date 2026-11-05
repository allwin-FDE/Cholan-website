import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Card, Drawer, ErrorNote, Icon, Loading, when } from '../../dashboard/ui.jsx';
import { BACK, FORWARD, FORWARD_LABEL, Field, FLOW, METHODS, PaidBadge, SOURCES, STEPS, StepBadge, WhHead, bags, rupees, useLive, useWh, wh } from '../shared.jsx';

export default function OrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { seesMoney } = useWh();
  const { data: order, error, reload, setData } = useLive(() => wh.get(`/orders/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [panel, setPanel] = useState(null); // cancelled | returned | payment | reverse

  const refresh = () => {
    setPanel(null);
    reload();
  };
  const move = async (to, extra = {}) => {
    setBusy(true);
    setProblem('');
    try {
      const saved = await wh.post(`/orders/${id}/status`, { to, ...extra });
      setData({ ...order, ...saved });
      // Only the form that asked for this; another may have been opened meanwhile.
      setPanel((open) => (open === to ? null : open));
      reload();
    } catch (e) {
      setProblem(e.message);
    }
    setBusy(false);
  };
  const makeInvoice = async () => {
    setBusy(true);
    setProblem('');
    try {
      const invoice = await wh.post(`/orders/${id}/invoice`);
      navigate(`/warehouse/invoices/${invoice.id}`);
    } catch (e) {
      setProblem(e.message);
      setBusy(false);
    }
  };

  if (error) return <div className="dash-page"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!order) return <div className="dash-page"><Loading /></div>;

  const { customer } = order;
  const next = FORWARD[order.status];
  const back = BACK[order.status];
  const canCancel = seesMoney && ['new', 'confirmed', 'packing', 'packed'].includes(order.status);
  const canReturn = seesMoney && ['dispatched', 'delivered'].includes(order.status);
  const canEdit = ['new', 'confirmed', 'packing', 'packed'].includes(order.status);
  const closed = ['cancelled', 'returned'].includes(order.status);
  const due = (order.totalPaise || 0) - (order.paidPaise || 0);

  return (
    <div className="dash-page">
      <WhHead
        title={order.number}
        actions={
          <Link to="/warehouse/orders" className="dash-link">
            <Icon name="back" /> All orders
          </Link>
        }
      />
      <div className="wh-order-head">
        <StepBadge status={order.status} />
        {seesMoney && <PaidBadge status={order.paymentStatus} />}
        <span className="dash-muted">
          {SOURCES[order.source]} · {when(order.createdAt)} · by {order.createdBy}
        </span>
      </div>

      {!closed && (
        <ol className="wh-steps" aria-label="Order steps">
          {FLOW.map((key, i) => (
            <li key={key} className={i < FLOW.indexOf(order.status) ? 'is-done' : key === order.status ? 'is-now' : ''}>
              {STEPS[key].label}
            </li>
          ))}
        </ol>
      )}

      {problem && (
        <div className="dash-flash dash-flash--bad" role="alert">
          {problem}
        </div>
      )}

      {!closed && next && (
        <button type="button" className="dash-btn dash-btn--wide wh-big wh-next" onClick={() => move(next)} disabled={busy}>
          {busy ? 'Saving…' : FORWARD_LABEL[order.status]}
        </button>
      )}
      <div className="dash-row wh-order-actions">
        {back && (
          <button type="button" className="dash-btn dash-btn--ghost" onClick={() => move(back)} disabled={busy}>
            <Icon name="back" /> Back to {STEPS[back].label}
          </button>
        )}
        {canEdit && (
          <Link to={`/warehouse/orders/${id}/edit`} className="dash-btn dash-btn--ghost">
            <Icon name="pen" /> Edit
          </Link>
        )}
        <Link to={`/warehouse/orders/${id}/slip`} className="dash-btn dash-btn--ghost">
          <Icon name="page" /> Packing slip
        </Link>
        <a href={`tel:${customer.phone}`} className="dash-btn dash-btn--ghost">
          <Icon name="phone" /> Call
        </a>
        {canCancel && (
          <button type="button" className="dash-btn dash-btn--danger" onClick={() => setPanel('cancelled')}>
            Cancel order
          </button>
        )}
        {canReturn && (
          <button type="button" className="dash-btn dash-btn--danger" onClick={() => setPanel('returned')}>
            Mark returned
          </button>
        )}
      </div>

      <div className="wh-order-grid">
        <div>
          <Card title={`Products · ${bags(order.items)} ${bags(order.items) === 1 ? 'bag' : 'bags'}`}>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Bags</th>
                    {seesMoney && <th>Price</th>}
                    {seesMoney && <th>Amount</th>}
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={`${item.productId}-${item.pack}`}>
                      <td>{item.name}</td>
                      <td>{item.pack}</td>
                      <td>{item.qty}</td>
                      {seesMoney && <td>{item.unitPaise ? rupees(item.unitPaise) : <Badge tone="warn">No price</Badge>}</td>}
                      {seesMoney && <td>{rupees(item.unitPaise * item.qty)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {order.notes && (
              <p className="wh-notes">
                <strong>Notes:</strong> {order.notes}
              </p>
            )}
          </Card>
          <Card title="History" className="wh-gap">
            <ol className="wh-history">
              {[...order.history].reverse().map((entry, i) => (
                <li key={i}>
                  <strong>{entry.action}</strong>
                  {entry.detail && <span> · {entry.detail}</span>}
                  <small>
                    {entry.by} · {when(entry.at)}
                  </small>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div>
          <Card title="Customer">
            <p className="wh-address">
              <strong>{customer.name}</strong>
              <br />
              {customer.phone}
              {customer.address && (
                <>
                  <br />
                  {customer.address}
                </>
              )}
              <br />
              {[customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')}
              {customer.gstin && (
                <>
                  <br />
                  GSTIN: {customer.gstin}
                </>
              )}
            </p>
          </Card>
          {seesMoney && (
            <Card title="Payment" className="wh-gap">
              <dl className="wh-sums">
                <dt>Total</dt>
                <dd>{rupees(order.totalPaise)}</dd>
                <dt>Paid</dt>
                <dd>{rupees(order.paidPaise)}</dd>
                <dt>Due</dt>
                <dd>
                  <strong>{rupees(due)}</strong>
                </dd>
              </dl>
              {!closed && due > 0 && (
                <button type="button" className="dash-btn dash-btn--wide" onClick={() => setPanel('payment')}>
                  <Icon name="plus" /> Record payment
                </button>
              )}
              {order.payments?.length > 0 && (
                <ul className="wh-payments">
                  {order.payments.map((p) => (
                    <li key={p.id} className={p.reversed ? 'is-reversed' : ''}>
                      <span>
                        <strong>{rupees(p.amountPaise)}</strong> {METHODS[p.method]}
                        {p.reference && ` · ${p.reference}`}
                        <small>
                          {when(p.at)} · {p.by}
                          {p.reversed && ` · Reversed: ${p.reverseReason}`}
                        </small>
                      </span>
                      {!p.reversed && (
                        <button type="button" className="dash-link" onClick={() => setPanel({ reverse: p })}>
                          Reverse
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {seesMoney && !closed && (
            <Card title="Invoice" className="wh-gap">
              {order.invoiceId ? (
                <Link to={`/warehouse/invoices/${order.invoiceId}`} className="dash-btn dash-btn--ghost dash-btn--wide">
                  <Icon name="file" /> {order.invoiceNumber}
                </Link>
              ) : order.status === 'new' ? (
                <p className="dash-muted dash-small">Confirm the order to make its invoice.</p>
              ) : (
                <button type="button" className="dash-btn dash-btn--ghost dash-btn--wide" onClick={makeInvoice} disabled={busy}>
                  <Icon name="file" /> Make invoice
                </button>
              )}
            </Card>
          )}
        </div>
      </div>

      <ReasonDrawer
        open={panel === 'cancelled' || panel === 'returned'}
        title={panel === 'cancelled' ? 'Cancel this order?' : 'Mark as returned?'}
        hint={panel === 'cancelled' ? 'Any bags held for this order go back to available stock.' : 'Say what condition the bags came back in.'}
        action={panel === 'cancelled' ? 'Cancel order' : 'Mark returned'}
        askCondition={panel === 'returned'}
        onClose={() => setPanel(null)}
        onSubmit={({ reason, condition }) => move(panel, { note: reason, condition })}
        problem={problem}
      />
      {panel === 'payment' && <PaymentDrawer order={order} onClose={() => setPanel(null)} onDone={refresh} />}
      <ReasonDrawer
        open={Boolean(panel?.reverse)}
        title="Reverse this payment?"
        hint="It stays on the record, marked reversed, and the amount is due again."
        action="Reverse payment"
        onClose={() => setPanel(null)}
        onSubmit={async ({ reason }) => {
          setProblem('');
          try {
            await wh.post(`/payments/${panel.reverse.id}/reverse`, { reason });
            refresh();
          } catch (e) {
            setProblem(e.message);
          }
        }}
        problem={problem}
      />
    </div>
  );
}

export function ReasonDrawer({ open, title, hint, action, askCondition, onClose, onSubmit, problem }) {
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState('good');
  return (
    <Drawer open={open} onClose={onClose} title={title}>
      <form
        className="wh-drawer-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ reason, condition });
        }}
      >
        <p className="dash-muted">{hint}</p>
        {askCondition && (
          <Field label="Condition of the bags">
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="good">Good: back into stock</option>
              <option value="damaged">Damaged: kept out of stock</option>
            </select>
          </Field>
        )}
        <Field label="Reason">
          <textarea id="wh-reason" rows={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {problem && (
          <p className="dash-field-error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="dash-btn dash-btn--danger dash-btn--wide">
          {action}
        </button>
      </form>
    </Drawer>
  );
}

function PaymentDrawer({ order, onClose, onDone }) {
  const due = order.totalPaise - order.paidPaise;
  const [amount, setAmount] = useState(String(due / 100));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProblem('');
    try {
      await wh.post(`/orders/${order.id}/payments`, { amount, method, reference });
      onDone();
    } catch (error) {
      setProblem(error.message);
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={`Payment for ${order.number}`}>
      <form className="wh-drawer-form" onSubmit={submit}>
        <p className="dash-muted">{rupees(due)} is due.</p>
        <Field label="Amount received (₹)">
          <input id="wh-amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="How was it paid?">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(METHODS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference (optional)" hint="UTR, cheque number or similar.">
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {problem && (
          <p className="dash-field-error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="dash-btn dash-btn--wide" disabled={busy}>
          {busy ? 'Saving…' : 'Save payment'}
        </button>
      </form>
    </Drawer>
  );
}
