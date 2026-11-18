import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, Stat, useLoad } from '../../ui.jsx';
import { CREDIT_STATUS, money, niceDate, phoneShow, todayIst } from './shared.js';
import { CustomerPicker } from './Orders.jsx';
import NotConnected from './NotConnected.jsx';

const METHODS = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque', card: 'Card', razorpay: 'Razorpay', other: 'Other' };

// Money received and what each customer owes. A payment is matched to their
// oldest unpaid invoice first (or to the invoices you choose); money left over
// is kept as an advance for the next invoice.
export default function Payments() {
  const { allowed } = useDash();
  const dues = useLoad(() => api.sales.dues(), []);
  const receipts = useLoad(() => api.sales.receipts(), []);
  const [recording, setRecording] = useState(null); // null | {} | { party }
  const [account, setAccount] = useState(null);
  const refresh = () => {
    dues.reload();
    receipts.reload();
  };

  if (dues.error?.code === 'no-database') return <NotConnected title="Payments" />;
  const rows = dues.data?.dues || [];
  const total = (key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
  return (
    <div className="dash-page">
      <PageHead
        title="Payments and dues"
        intro="Record money received and see who owes what, oldest first."
        range={false}
        actions={
          allowed('editor') && (
            <button type="button" className="dash-btn" onClick={() => setRecording({})}>
              <Icon name="plus" /> Record payment
            </button>
          )
        }
      />
      {dues.error && <ErrorNote error={dues.error} onRetry={dues.reload} />}
      {dues.loading && !dues.data && <Loading />}
      {dues.data && (
        <>
          <div className="dash-stats">
            <Stat label="Owed on invoices" value={money(total('invoiced_due_paise'))} />
            <Stat label="Overdue" value={money(total('overdue_paise'))} />
            <Stat label="Advances held" value={money(total('advance_paise'))} />
            <Stat label="Orders not yet invoiced" value={money(total('open_orders_paise'))} />
          </div>
          <Card title="Who owes what">
            {rows.length ? (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="dash-num">Owes</th>
                      <th className="dash-num">0–15 days</th>
                      <th className="dash-num">16–30</th>
                      <th className="dash-num">31–60</th>
                      <th className="dash-num">60+</th>
                      <th>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.party_id} className="dash-row-link" onClick={() => setAccount(r)}>
                        <td>
                          <strong>{r.customer}</strong>
                          {r.overdue_invoices > 0 && <Badge tone="bad">{r.oldest_overdue_days} days late</Badge>}
                          {r.advance_paise > 0 && <span className="dash-muted dash-block dash-small">Advance {money(r.advance_paise)}</span>}
                        </td>
                        <td className="dash-num">
                          <strong>{money(r.net_due_paise)}</strong>
                        </td>
                        <td className="dash-num">{r.due_0_15_paise ? money(r.due_0_15_paise) : ''}</td>
                        <td className="dash-num">{r.due_16_30_paise ? money(r.due_16_30_paise) : ''}</td>
                        <td className="dash-num">{r.due_31_60_paise ? money(r.due_31_60_paise) : ''}</td>
                        <td className="dash-num">{r.due_over_60_paise ? money(r.due_over_60_paise) : ''}</td>
                        <td className="dash-small">
                          {r.credit_limit_paise ? `${money(r.credit_limit_paise)} · ${r.terms_days} days` : 'No credit'}
                          {r.credit_status && r.credit_status !== 'active' && <Badge tone={CREDIT_STATUS[r.credit_status][1]}>{CREDIT_STATUS[r.credit_status][0]}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon="rupee" title="Nobody owes anything">
                Unpaid invoices show here, oldest first.
              </Empty>
            )}
          </Card>
        </>
      )}

      <Card title="Recent payments">
        {receipts.loading && !receipts.data && <Loading />}
        {receipts.data &&
          (receipts.data.receipts.length ? (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>How</th>
                    <th className="dash-num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {receipts.data.receipts.map((r) => (
                    <tr key={r.id} className={r.status === 'reversed' ? 'is-off' : ''}>
                      <td className="dash-nowrap">
                        <strong>{r.number}</strong>
                      </td>
                      <td className="dash-nowrap">{niceDate(r.receipt_date)}</td>
                      <td>{r.customer}</td>
                      <td className="dash-small">
                        {METHODS[r.method]} {r.reference && <span className="dash-muted">· {r.reference}</span>}
                      </td>
                      <td className="dash-num">
                        {money(r.amount_paise)}
                        {r.status === 'active' && r.unallocated_paise > 0 && <span className="dash-muted dash-block dash-small">{money(r.unallocated_paise)} advance</span>}
                      </td>
                      <td>
                        {r.status === 'reversed' ? (
                          <Badge tone="muted" title={r.reverse_reason}>
                            Reversed
                          </Badge>
                        ) : (
                          allowed('admin') && (
                            <button
                              type="button"
                              className="dash-link"
                              onClick={async () => {
                                const reason = window.prompt(`Reverse payment ${r.number}? Give the reason (for example, entered twice or cheque bounced).`);
                                if (!reason) return;
                                try {
                                  await api.sales.reverseReceipt(r.id, reason);
                                  refresh();
                                } catch (e) {
                                  window.alert(e.message);
                                }
                              }}
                            >
                              Reverse
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="dash-muted">No payments recorded yet.</p>
          ))}
      </Card>

      {recording && (
        <RecordPayment
          start={recording.party}
          onClose={() => setRecording(null)}
          onSaved={() => {
            setRecording(null);
            setAccount(null);
            refresh();
          }}
        />
      )}
      {account && !recording && <AccountDrawer row={account} onClose={() => setAccount(null)} onPay={() => setRecording({ party: { id: account.party_id, display_name: account.customer, phone: account.phone } })} />}
    </div>
  );
}

function AccountDrawer({ row, onClose, onPay }) {
  const { allowed } = useDash();
  const acct = useLoad(() => api.sales.account(row.party_id), [row.party_id]);
  return (
    <Drawer open onClose={onClose} title={row.customer} wide>
      {acct.loading && !acct.data && <Loading />}
      {acct.error && <ErrorNote error={acct.error} />}
      {acct.data && (
        <>
          <dl className="dash-facts">
            <div>
              <dt>Owes</dt>
              <dd>
                <strong>{money(acct.data.balance?.net_due_paise || 0)}</strong> {phoneShow(row.phone) && <span className="dash-muted">· {phoneShow(row.phone)}</span>}
              </dd>
            </div>
            <div>
              <dt>Credit</dt>
              <dd>
                {acct.data.credit.limitPaise ? `Limit ${money(acct.data.credit.limitPaise)}` : 'No credit limit'} {acct.data.credit.ok ? <Badge tone="good">Can take orders</Badge> : <Badge tone="bad">Blocked for new orders</Badge>}
                {!acct.data.credit.ok && <span className="dash-block dash-small">{acct.data.credit.problems.join('; ')}</span>}
              </dd>
            </div>
          </dl>
          {allowed('editor') && (
            <button type="button" className="dash-btn" onClick={onPay}>
              <Icon name="plus" /> Record a payment from them
            </button>
          )}
          <section className="biz-section">
            <h3>Unpaid invoices</h3>
            {acct.data.invoices.length ? (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th className="dash-num">Total</th>
                    <th className="dash-num">Left to pay</th>
                  </tr>
                </thead>
                <tbody>
                  {acct.data.invoices.map((i) => (
                    <tr key={i.invoice_id}>
                      <td>{i.number}</td>
                      <td className="dash-nowrap">{niceDate(i.invoice_date)}</td>
                      <td className="dash-nowrap">
                        {niceDate(i.due_date)} {i.days_overdue > 0 && <Badge tone="bad">{i.days_overdue} days late</Badge>}
                      </td>
                      <td className="dash-num">{money(i.total_paise)}</td>
                      <td className="dash-num">
                        <strong>{money(i.balance_paise)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="dash-muted">Nothing unpaid.</p>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

function RecordPayment({ start, onClose, onSaved }) {
  const [party, setParty] = useState(start || null);
  const [form, setForm] = useState({ amount: '', method: 'upi', reference: '', date: todayIst(), notes: '' });
  const [mode, setMode] = useState('oldest');
  const [open, setOpen] = useState([]);
  const [split, setSplit] = useState({});
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOpen([]);
    setSplit({});
    if (party) api.sales.account(party.id).then((a) => setOpen(a.invoices.filter((i) => i.balance_paise > 0))).catch(setProblem);
  }, [party]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const err = (k) => problem?.fields?.[k] && <span className="dash-field-error">{problem.fields[k]}</span>;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const allocations = mode === 'choose' ? Object.entries(split).filter(([, v]) => Number(v) > 0).map(([invoiceId, amount]) => ({ invoiceId: Number(invoiceId), amount })) : undefined;
      await api.sales.createReceipt({ partyId: party?.id, ...form, allocations });
      onSaved();
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title="Record a payment" wide>
      <form onSubmit={save}>
        <div className="biz-form">
          <div className="dash-field biz-wide">
            <span className="dash-field__label">Paid by</span>
            <CustomerPicker value={party} onPick={setParty} />
            {err('partyId')}
          </div>
          <label className="dash-field">
            <span className="dash-field__label">Amount (₹)</span>
            <input value={form.amount} onChange={set('amount')} inputMode="decimal" required />
            {err('amount')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">How</span>
            <select value={form.method} onChange={set('method')}>
              {Object.entries(METHODS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Reference {['cash', 'card', 'other'].includes(form.method) ? '(optional)' : '(UTR / cheque no.)'}</span>
            <input value={form.reference} onChange={set('reference')} />
            {err('reference')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Date received</span>
            <input type="date" value={form.date} onChange={set('date')} />
          </label>
        </div>
        {party && (
          <section className="biz-section">
            <h3>Which invoices it pays</h3>
            <div className="dash-seg" role="group" aria-label="Match to">
              <button type="button" className={mode === 'oldest' ? 'is-on' : ''} onClick={() => setMode('oldest')}>
                Oldest first (usual)
              </button>
              <button type="button" className={mode === 'choose' ? 'is-on' : ''} onClick={() => setMode('choose')}>
                Choose invoices
              </button>
            </div>
            {open.length === 0 && <p className="dash-muted dash-small">No unpaid invoices: the whole amount is kept as an advance.</p>}
            {open.length > 0 && (
              <table className="dash-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th className="dash-num">Left to pay</th>
                    {mode === 'choose' && <th className="dash-num">Pay now (₹)</th>}
                  </tr>
                </thead>
                <tbody>
                  {open.map((i) => (
                    <tr key={i.invoice_id}>
                      <td>{i.number}</td>
                      <td>{niceDate(i.invoice_date)}</td>
                      <td className="dash-num">{money(i.balance_paise)}</td>
                      {mode === 'choose' && (
                        <td className="dash-num">
                          <input className="biz-price" value={split[i.invoice_id] || ''} onChange={(e) => setSplit({ ...split, [i.invoice_id]: e.target.value })} inputMode="decimal" />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {problem && <div className="dash-error">{problem.message}</div>}
        <button type="submit" className="dash-btn" disabled={busy || !party} style={{ marginTop: 12 }}>
          {busy ? 'Saving…' : 'Save payment'}
        </button>
      </form>
    </Drawer>
  );
}
