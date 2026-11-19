import { useState } from 'react';
import { api } from '../../shared/api.js';
import { useDash } from '../../shared/context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, Stat, useLoad } from '../../shared/ui.jsx';
import { money, niceDate, phoneShow } from './shared.js';
import { NewBill, NewGoodsReceived, NewPurchaseOrder, PaySupplier, PAY_METHODS } from './PurchaseForms.jsx';
import NotConnected from './NotConnected.jsx';
import { useUrl, useUrlSearch } from '../../shared/urlState.js';

// Buying: what is owed to suppliers, their bills, goods received (stock comes
// in as a batch), purchase orders, and payments made. Staff record goods
// received, bills and payments; Admin and Owner also raise purchase orders and
// cancel or reverse.

const TABS = { owed: 'Owed to suppliers', bills: 'Bills', received: 'Goods received', orders: 'Purchase orders', paid: 'Payments made' };
const PO_STATUS = {
  open: ['Open', 'neutral'],
  part_received: ['Part received', 'warn'],
  received: ['Received', 'good'],
  closed: ['Closed', 'muted'],
  cancelled: ['Cancelled', 'muted'],
};
const OPEN_KEYS = ['supplier', 'bill', 'grn', 'po'];
const CLOSED = Object.fromEntries([...OPEN_KEYS, 'new', 'for'].map((k) => [k, '']));
const qtyShow = (n) => (n == null ? '' : Number(n).toLocaleString('en-IN'));
const askReason = (question) => {
  const reason = window.prompt(question);
  return reason && reason.trim() ? reason.trim() : null;
};
const run = async (work, after) => {
  try {
    await work();
    after();
  } catch (e) {
    window.alert(e.message);
  }
};

export default function Purchases() {
  const { allowed } = useDash();
  // The address holds the view: ?tab=bills, an open record (?bill=12,
  // ?grn=3, ?po=4, ?supplier=5) and an open form (?new=grn|bill|pay|po, with
  // &for= the order, goods received or supplier it starts from).
  const { get, id, patch } = useUrl();
  const tab = TABS[get('tab')] ? get('tab') : 'owed';
  const setTab = (key) => patch({ tab: key === 'owed' ? '' : key });
  const openKind = OPEN_KEYS.find((k) => id(k));
  const open = openKind ? { kind: openKind, id: id(openKind) } : null;
  const setOpen = (o) => patch({ ...CLOSED, ...(o ? { [o.kind]: o.id } : {}) });
  const formKind = ['po', 'grn', 'bill', 'pay'].includes(get('new')) ? get('new') : null;
  const form = formKind ? { kind: formKind, for: id('for') } : null;
  const setForm = (f) => patch({ ...CLOSED, ...(f ? { new: f.kind, for: f.for } : {}) });
  const [stamp, setStamp] = useState(0);
  const payables = useLoad(() => api.inward.payables(), [stamp]);
  const refresh = () => setStamp((s) => s + 1);
  const saved = (nextTab) => () => {
    patch({ ...CLOSED, tab: nextTab === 'owed' ? '' : nextTab }, { replace: true });
    refresh();
  };

  if (payables.error?.code === 'no-database') return <NotConnected title="Purchases" />;
  const rows = payables.data?.payables || [];
  const total = (key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
  const show = { onOpen: setOpen, stamp };
  return (
    <div className="dash-page">
      <PageHead
        title="Purchases"
        intro="Goods received go into stock as a batch. Enter the supplier's bill, then pay it: what you owe shows here, oldest first."
        range={false}
        actions={
          allowed('editor') && (
            <div className="dash-row biz-actions">
              <button type="button" className="dash-btn" onClick={() => setForm({ kind: 'grn' })}>
                <Icon name="plus" /> Goods received
              </button>
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setForm({ kind: 'bill' })}>
                <Icon name="file" /> Enter a bill
              </button>
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setForm({ kind: 'pay' })}>
                <Icon name="rupee" /> Pay a supplier
              </button>
              {allowed('admin') && (
                <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setForm({ kind: 'po' })}>
                  <Icon name="cart" /> Purchase order
                </button>
              )}
            </div>
          )
        }
      />
      {payables.error && <ErrorNote error={payables.error} onRetry={payables.reload} />}
      {payables.data && (
        <div className="dash-stats">
          <Stat label="Owed to suppliers" value={money(total('billed_due_paise'))} />
          <Stat label="Overdue" value={money(total('overdue_paise'))} />
          <Stat label="Advances paid" value={money(total('advance_paise'))} />
          <Stat label="Due in 0–15 days" value={money(total('due_0_15_paise'))} />
        </div>
      )}
      <Card>
        <div className="dash-filters">
          <div className="dash-seg biz-lists" role="group" aria-label="Show">
            {Object.entries(TABS).map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'owed' && <Owed state={payables} rows={rows} onOpen={setOpen} />}
        {tab === 'bills' && <Bills {...show} />}
        {tab === 'received' && <Received {...show} />}
        {tab === 'orders' && <Orders {...show} />}
        {tab === 'paid' && <Paid stamp={stamp} onChanged={refresh} />}
      </Card>

      {open?.kind === 'supplier' && <SupplierDrawer partyId={open.id} row={rows.find((r) => r.party_id === open.id)} onClose={() => setOpen(null)} onPay={(partyId) => setForm({ kind: 'pay', for: partyId })} />}
      {open?.kind === 'bill' && <BillDrawer id={open.id} onClose={() => setOpen(null)} onChanged={refresh} />}
      {open?.kind === 'grn' && <GoodsDrawer id={open.id} onClose={() => setOpen(null)} onBill={(grnId) => setForm({ kind: 'bill', for: grnId })} />}
      {open?.kind === 'po' && <OrderDrawer id={open.id} onClose={() => setOpen(null)} onChanged={refresh} onReceive={(poId) => setForm({ kind: 'grn', for: poId })} />}

      {form?.kind === 'po' && <NewPurchaseOrder onClose={() => setForm(null)} onSaved={saved('orders')} />}
      {form?.kind === 'grn' && <NewGoodsReceived start={form.for ? { orderId: form.for } : null} onClose={() => setForm(null)} onSaved={saved('received')} />}
      {form?.kind === 'bill' && <NewBill start={form.for ? { goodsReceivedId: form.for } : null} onClose={() => setForm(null)} onSaved={saved('bills')} />}
      {form?.kind === 'pay' && <PaySupplier startId={form.for} onClose={() => setForm(null)} onSaved={saved('paid')} />}
    </div>
  );
}

function Owed({ state, rows, onOpen }) {
  if (state.loading && !state.data) return <Loading />;
  if (!rows.length) {
    return (
      <Empty icon="rupee" title="Nothing owed to suppliers">
        Enter a supplier's bill and it shows here until it is paid.
      </Empty>
    );
  }
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th className="dash-num">Owed</th>
            <th className="dash-num">Overdue</th>
            <th className="dash-num">0–15 days</th>
            <th className="dash-num">16–30</th>
            <th className="dash-num">31–60</th>
            <th className="dash-num">60+</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.party_id} className="dash-row-link" onClick={() => onOpen({ kind: 'supplier', id: r.party_id })}>
              <td>
                <strong>{r.supplier}</strong>
                {r.advance_paise > 0 && <span className="dash-muted dash-block dash-small">Advance paid {money(r.advance_paise)}</span>}
              </td>
              <td className="dash-num">
                <strong>{money(r.net_due_paise)}</strong>
              </td>
              <td className="dash-num">{r.overdue_paise ? <Badge tone="bad">{money(r.overdue_paise)}</Badge> : ''}</td>
              <td className="dash-num">{r.due_0_15_paise ? money(r.due_0_15_paise) : ''}</td>
              <td className="dash-num">{r.due_16_30_paise ? money(r.due_16_30_paise) : ''}</td>
              <td className="dash-num">{r.due_31_60_paise ? money(r.due_31_60_paise) : ''}</td>
              <td className="dash-num">{r.due_over_60_paise ? money(r.due_over_60_paise) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bills({ onOpen, stamp }) {
  const [q, setQ, search] = useUrlSearch();
  const bills = useLoad(() => api.inward.bills(search), [search, stamp]);
  return (
    <>
      <label className="dash-search" style={{ marginBottom: 12 }}>
        <Icon name="search" />
        <input placeholder="Bill no., supplier…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {bills.error && <ErrorNote error={bills.error} onRetry={bills.reload} />}
      {bills.loading && !bills.data && <Loading />}
      {bills.data &&
        (bills.data.bills.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="dash-num">Total</th>
                  <th className="dash-num">Left to pay</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {bills.data.bills.map((b) => (
                  <tr key={b.id} className={`dash-row-link${b.status === 'cancelled' ? ' is-off' : ''}`} onClick={() => onOpen({ kind: 'bill', id: b.id })}>
                    <td className="dash-nowrap">
                      <strong>{b.supplier_bill_no}</strong>
                      <span className="dash-muted dash-block dash-small">{b.number}</span>
                    </td>
                    <td className="dash-nowrap">{niceDate(b.bill_date)}</td>
                    <td>{b.supplier}</td>
                    <td className="dash-num">{money(b.total_paise)}</td>
                    <td className="dash-num">{b.status === 'cancelled' ? <Badge tone="muted">Cancelled</Badge> : b.balance_paise > 0 ? <strong>{money(b.balance_paise)}</strong> : <Badge tone="good">Paid</Badge>}</td>
                    <td className="dash-nowrap dash-small">
                      {b.status === 'open' && b.balance_paise > 0 && (b.days_overdue > 0 ? <Badge tone="bad">{b.days_overdue} days late</Badge> : niceDate(b.due_date))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="file" title={search ? 'No bill matches' : 'No supplier bills yet'}>
            Use “Enter a bill” when a supplier's bill arrives.
          </Empty>
        ))}
    </>
  );
}

function Received({ onOpen, stamp }) {
  const list = useLoad(() => api.inward.goodsReceived(), [stamp]);
  if (list.error) return <ErrorNote error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <Loading />;
  const rows = list.data?.receipts || [];
  if (!rows.length) {
    return (
      <Empty icon="box" title="No goods received yet">
        When stock arrives, record it here: it goes into stock as a new batch.
      </Empty>
    );
  }
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>Received</th>
            <th>Date</th>
            <th>Supplier</th>
            <th>Into</th>
            <th className="dash-num">Accepted</th>
            <th>Bill</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="dash-row-link" onClick={() => onOpen({ kind: 'grn', id: r.id })}>
              <td className="dash-nowrap">
                <strong>{r.number}</strong>
                {r.order_number && <span className="dash-muted dash-block dash-small">for {r.order_number}</span>}
              </td>
              <td className="dash-nowrap">{niceDate(r.received_on)}</td>
              <td>{r.supplier}</td>
              <td className="dash-small">{r.location}</td>
              <td className="dash-num">
                {qtyShow(r.qty_accepted)}
                {r.qty_accepted < r.qty_received && <span className="dash-muted dash-block dash-small">{qtyShow(r.qty_received - r.qty_accepted)} rejected</span>}
              </td>
              <td className="dash-small">{r.bill_number || <Badge tone="warn">No bill yet</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Orders({ onOpen, stamp }) {
  const { get, patch } = useUrl();
  const status = get('show') === 'all' ? '' : 'open';
  const setStatus = (key) => patch({ show: key ? '' : 'all' });
  const list = useLoad(() => api.inward.purchaseOrders(status), [status, stamp]);
  return (
    <>
      <div className="dash-seg" role="group" aria-label="Which orders" style={{ marginBottom: 12 }}>
        {[['open', 'Waiting for goods'], ['', 'All']].map(([key, label]) => (
          <button key={key || 'all'} type="button" className={status === key ? 'is-on' : ''} onClick={() => setStatus(key)}>
            {label}
          </button>
        ))}
      </div>
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}
      {list.data &&
        (list.data.orders.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="dash-num">Received</th>
                  <th className="dash-num">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.data.orders.map((o) => (
                  <tr key={o.id} className={`dash-row-link${o.status === 'cancelled' ? ' is-off' : ''}`} onClick={() => onOpen({ kind: 'po', id: o.id })}>
                    <td className="dash-nowrap">
                      <strong>{o.number}</strong>
                    </td>
                    <td className="dash-nowrap">
                      {niceDate(o.order_date)}
                      {o.expected_on && <span className="dash-muted dash-block dash-small">expected {niceDate(o.expected_on)}</span>}
                    </td>
                    <td>{o.supplier}</td>
                    <td className="dash-num">
                      {qtyShow(o.qty_received)} / {qtyShow(o.qty)}
                    </td>
                    <td className="dash-num">{money(o.value_paise)}</td>
                    <td>
                      <Badge tone={PO_STATUS[o.status]?.[1]}>{PO_STATUS[o.status]?.[0] || o.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="cart" title={status ? 'No orders waiting for goods' : 'No purchase orders yet'}>
            A purchase order is optional: it records what you ordered, so goods received can be checked against it.
          </Empty>
        ))}
    </>
  );
}

function Paid({ stamp, onChanged }) {
  const { allowed } = useDash();
  const list = useLoad(() => api.inward.payments(), [stamp]);
  if (list.error) return <ErrorNote error={list.error} onRetry={list.reload} />;
  if (list.loading && !list.data) return <Loading />;
  const rows = list.data?.payments || [];
  if (!rows.length) return <p className="dash-muted">No payments to suppliers recorded yet.</p>;
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>Payment</th>
            <th>Date</th>
            <th>Supplier</th>
            <th>How</th>
            <th className="dash-num">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={p.status === 'reversed' ? 'is-off' : ''}>
              <td className="dash-nowrap">
                <strong>{p.number}</strong>
              </td>
              <td className="dash-nowrap">{niceDate(p.payment_date)}</td>
              <td>{p.supplier}</td>
              <td className="dash-small">
                {PAY_METHODS[p.method] || p.method} {p.reference && <span className="dash-muted">· {p.reference}</span>}
              </td>
              <td className="dash-num">
                {money(p.amount_paise)}
                {p.status === 'active' && p.unallocated_paise > 0 && <span className="dash-muted dash-block dash-small">{money(p.unallocated_paise)} advance</span>}
              </td>
              <td>
                {p.status === 'reversed' ? (
                  <Badge tone="muted">Reversed</Badge>
                ) : (
                  allowed('admin') && (
                    <button
                      type="button"
                      className="dash-link"
                      onClick={() => {
                        const reason = askReason(`Reverse payment ${p.number}? Give the reason (for example, entered twice or cheque bounced).`);
                        if (reason) run(() => api.inward.reversePayment(p.id, reason), onChanged);
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
  );
}

function SupplierDrawer({ partyId, row: listed, onClose, onPay }) {
  const { allowed } = useDash();
  const acct = useLoad(() => api.inward.supplierAccount(partyId), [partyId]);
  // Opened from a link: the supplier may not be in the owed list, so look them up.
  const party = useLoad(() => (listed ? Promise.resolve(null) : api.business.party(partyId)), [partyId, Boolean(listed)]);
  const row = listed || { party_id: partyId, supplier: party.data?.display_name || 'Supplier', phone: party.data?.phone, terms_days: party.data?.supplier_terms_days };
  return (
    <Drawer open onClose={onClose} title={row.supplier} wide>
      {acct.loading && !acct.data && <Loading />}
      {acct.error && <ErrorNote error={acct.error} />}
      {acct.data && (
        <>
          <dl className="dash-facts">
            <div>
              <dt>You owe</dt>
              <dd>
                <strong>{money(acct.data.balance?.net_due_paise || 0)}</strong> {phoneShow(row.phone) && <span className="dash-muted">· {phoneShow(row.phone)}</span>}
              </dd>
            </div>
            <div>
              <dt>Terms</dt>
              <dd>{row.terms_days ? `${row.terms_days} days` : 'Pay on bill'}</dd>
            </div>
          </dl>
          {allowed('editor') && (
            <button type="button" className="dash-btn" onClick={() => onPay(row.party_id)}>
              <Icon name="rupee" /> Pay this supplier
            </button>
          )}
          <section className="biz-section">
            <h3>Unpaid bills</h3>
            {acct.data.bills.length ? (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th className="dash-num">Total</th>
                    <th className="dash-num">Left to pay</th>
                  </tr>
                </thead>
                <tbody>
                  {acct.data.bills.map((b) => (
                    <tr key={b.bill_id}>
                      <td>{b.supplier_bill_no}</td>
                      <td className="dash-nowrap">{niceDate(b.bill_date)}</td>
                      <td className="dash-nowrap">
                        {niceDate(b.due_date)} {b.days_overdue > 0 && <Badge tone="bad">{b.days_overdue} days late</Badge>}
                      </td>
                      <td className="dash-num">{money(b.total_paise)}</td>
                      <td className="dash-num">
                        <strong>{money(b.balance_paise)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="dash-muted">Nothing unpaid.</p>
            )}
          </section>
          <section className="biz-section">
            <h3>Payments</h3>
            {acct.data.payments.length ? (
              <ul className="biz-history">
                {acct.data.payments.slice(0, 20).map((p) => (
                  <li key={p.id} className={p.status === 'reversed' ? 'is-off' : ''}>
                    {niceDate(p.payment_date)} · <strong>{money(p.amount_paise)}</strong> {PAY_METHODS[p.method]} {p.reference && `· ${p.reference}`} {p.status === 'reversed' && <Badge tone="muted">Reversed</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">No payments yet.</p>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

function BillDrawer({ id, onClose, onChanged }) {
  const { allowed } = useDash();
  const bill = useLoad(() => api.inward.bill(id), [id]);
  const b = bill.data;
  return (
    <Drawer open onClose={onClose} title={b ? `Bill ${b.supplier_bill_no}` : 'Bill'} wide>
      {bill.loading && !b && <Loading />}
      {bill.error && <ErrorNote error={bill.error} />}
      {b && (
        <>
          <dl className="dash-facts">
            <div>
              <dt>Supplier</dt>
              <dd>
                {b.supplier} {b.supplier_gstin && <span className="dash-muted">· {b.supplier_gstin}</span>}
              </dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>
                Billed {niceDate(b.bill_date)} · due {niceDate(b.due_date)} <span className="dash-muted">· our no. {b.number}</span>
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                <strong>{money(b.total_paise)}</strong>{' '}
                <span className="dash-muted">
                  ({money(b.taxable_paise)} + GST {money(b.cgst_paise + b.sgst_paise + b.igst_paise)}
                  {b.round_off_paise ? ` · rounding ${money(b.round_off_paise)}` : ''})
                </span>{' '}
                {b.itc_eligible ? <Badge tone="good">GST claimable</Badge> : <Badge tone="muted">No GST credit</Badge>}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {b.status === 'cancelled' ? (
                  <Badge tone="muted">Cancelled: {b.cancel_reason}</Badge>
                ) : b.balance_paise > 0 ? (
                  <>
                    <strong>{money(b.balance_paise)}</strong> left to pay {b.days_overdue > 0 && <Badge tone="bad">{b.days_overdue} days late</Badge>}
                  </>
                ) : (
                  <Badge tone="good">Paid</Badge>
                )}
              </dd>
            </div>
            {b.goods_received_number && (
              <div>
                <dt>For goods received</dt>
                <dd>{b.goods_received_number}</dd>
              </div>
            )}
          </dl>
          <section className="biz-section">
            <h3>Lines</h3>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="dash-num">Qty</th>
                    <th className="dash-num">Rate</th>
                    <th className="dash-num">GST</th>
                    <th className="dash-num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.description} {l.hsn && <span className="dash-muted dash-small">HSN {l.hsn}</span>}
                      </td>
                      <td className="dash-num">
                        {qtyShow(l.qty)} {l.unit}
                      </td>
                      <td className="dash-num">{money(l.rate_paise)}</td>
                      <td className="dash-num">{l.gst_rate_bp / 100}%</td>
                      <td className="dash-num">{money(l.taxable_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {(b.payments.length > 0 || b.returns.length > 0) && (
            <section className="biz-section">
              <h3>Paid and returned</h3>
              <ul className="biz-history">
                {b.payments.map((p, i) => (
                  <li key={`p${i}`} className={!p.active || p.status !== 'active' ? 'is-off' : ''}>
                    {niceDate(p.payment_date)} · {p.number} · <strong>{money(p.amount_paise)}</strong> {PAY_METHODS[p.method]} {(!p.active || p.status !== 'active') && <Badge tone="muted">Reversed</Badge>}
                  </li>
                ))}
                {b.returns.map((r) => (
                  <li key={`r${r.id}`}>
                    {niceDate(r.return_date)} · Return {r.number} · <strong>{money(r.total_paise)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {b.notes && <p className="dash-small dash-muted">{b.notes}</p>}
          {allowed('admin') && b.status === 'open' && (
            <button
              type="button"
              className="dash-btn dash-btn--ghost dash-btn--sm"
              onClick={() => {
                const reason = askReason(`Cancel bill ${b.supplier_bill_no}? Give the reason (for example, entered twice).`);
                if (reason)
                  run(
                    () => api.inward.cancelBill(b.id, reason),
                    () => {
                      bill.reload();
                      onChanged();
                    },
                  );
              }}
            >
              Cancel this bill
            </button>
          )}
        </>
      )}
    </Drawer>
  );
}

function GoodsDrawer({ id, onClose, onBill }) {
  const { allowed } = useDash();
  const grn = useLoad(() => api.inward.goodsReceivedNote(id), [id]);
  const g = grn.data;
  const net = g?.gross_kg && g?.tare_kg ? Number(g.gross_kg) - Number(g.tare_kg) : null;
  return (
    <Drawer open onClose={onClose} title={g ? `Goods received ${g.number}` : 'Goods received'} wide>
      {grn.loading && !g && <Loading />}
      {grn.error && <ErrorNote error={grn.error} />}
      {g && (
        <>
          <dl className="dash-facts">
            <div>
              <dt>From</dt>
              <dd>
                {g.supplier} {g.supplier_doc_no && <span className="dash-muted">· their no. {g.supplier_doc_no}</span>}
              </dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>
                {niceDate(g.received_on)} into {g.location} {g.order_number && <span className="dash-muted">· for {g.order_number}</span>}
              </dd>
            </div>
            {(g.vehicle_no || net || g.moisture_pct) && (
              <div>
                <dt>Vehicle</dt>
                <dd>
                  {[g.vehicle_no, g.weighbridge_ticket && `ticket ${g.weighbridge_ticket}`, net && `net ${net.toLocaleString('en-IN')} kg`, g.moisture_pct && `moisture ${g.moisture_pct}%`].filter(Boolean).join(' · ')}
                </dd>
              </div>
            )}
            <div>
              <dt>Bill</dt>
              <dd>{g.bill_number || <Badge tone="warn">Not billed yet</Badge>}</dd>
            </div>
          </dl>
          {!g.bill_number && allowed('editor') && (
            <button type="button" className="dash-btn" onClick={() => onBill(g.id)}>
              <Icon name="file" /> Enter the bill for this
            </button>
          )}
          <section className="biz-section">
            <h3>Items</h3>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Batch</th>
                    <th className="dash-num">Arrived</th>
                    <th className="dash-num">Accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.item_name} {l.pack_label && !l.item_name.includes(l.pack_label) && l.pack_label}
                      </td>
                      <td className="dash-small">{l.batch_code || '—'}</td>
                      <td className="dash-num">{qtyShow(l.qty_received)}</td>
                      <td className="dash-num">
                        {qtyShow(l.qty_accepted)}
                        {l.reject_reason && <span className="dash-muted dash-block dash-small">{l.reject_reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {g.notes && <p className="dash-small dash-muted">{g.notes}</p>}
        </>
      )}
    </Drawer>
  );
}

function OrderDrawer({ id, onClose, onChanged, onReceive }) {
  const { allowed } = useDash();
  const po = useLoad(() => api.inward.purchaseOrder(id), [id]);
  const o = po.data;
  const isOpen = o && ['open', 'part_received'].includes(o.status);
  const after = () => {
    po.reload();
    onChanged();
  };
  return (
    <Drawer open onClose={onClose} title={o ? `Purchase order ${o.number}` : 'Purchase order'} wide>
      {po.loading && !o && <Loading />}
      {po.error && <ErrorNote error={po.error} />}
      {o && (
        <>
          <dl className="dash-facts">
            <div>
              <dt>Supplier</dt>
              <dd>{o.supplier}</dd>
            </div>
            <div>
              <dt>Dates</dt>
              <dd>
                Ordered {niceDate(o.order_date)}
                {o.expected_on && ` · expected ${niceDate(o.expected_on)}`}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge tone={PO_STATUS[o.status]?.[1]}>{PO_STATUS[o.status]?.[0] || o.status}</Badge> {o.cancel_reason && <span className="dash-muted">{o.cancel_reason}</span>}
              </dd>
            </div>
            {o.receipts.length > 0 && (
              <div>
                <dt>Goods received</dt>
                <dd>{o.receipts.map((r) => `${r.number} (${niceDate(r.received_on)})`).join(', ')}</dd>
              </div>
            )}
          </dl>
          <div className="dash-row biz-actions">
            {isOpen && allowed('editor') && (
              <button type="button" className="dash-btn" onClick={() => onReceive(o.id)}>
                <Icon name="plus" /> Record goods received
              </button>
            )}
            {isOpen && allowed('admin') && (
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                onClick={() => window.confirm(`Close ${o.number}? Nothing more is expected on it.`) && run(() => api.inward.setPurchaseOrderStatus(o.id, 'closed', ''), after)}
              >
                Close order
              </button>
            )}
            {o.status === 'open' && allowed('admin') && (
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                onClick={() => {
                  const reason = askReason(`Cancel ${o.number}? Give the reason.`);
                  if (reason) run(() => api.inward.setPurchaseOrderStatus(o.id, 'cancelled', reason), after);
                }}
              >
                Cancel order
              </button>
            )}
          </div>
          <section className="biz-section">
            <h3>Items</h3>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="dash-num">Ordered</th>
                    <th className="dash-num">Received</th>
                    <th className="dash-num">Rate</th>
                    <th className="dash-num">GST</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.item_name} {l.pack_label && !l.item_name.includes(l.pack_label) && l.pack_label}
                      </td>
                      <td className="dash-num">{qtyShow(l.qty)}</td>
                      <td className="dash-num">{qtyShow(l.qty_received)}</td>
                      <td className="dash-num">{money(l.rate_paise)}</td>
                      <td className="dash-num">{l.gst_rate_bp / 100}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {o.notes && <p className="dash-small dash-muted">{o.notes}</p>}
        </>
      )}
    </Drawer>
  );
}
