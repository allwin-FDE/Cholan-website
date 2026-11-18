import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, ago, useLoad, when } from '../../ui.jsx';
import { money, niceDate, phoneShow, stateName } from './shared.js';
import NotConnected from './NotConnected.jsx';

export const STATUS = {
  new: ['New', 'info'],
  confirmed: ['Confirmed', 'info'],
  packing: ['Packing', 'warn'],
  packed: ['Packed', 'warn'],
  dispatched: ['Dispatched', 'good'],
  delivered: ['Delivered', 'good'],
  cancelled: ['Cancelled', 'muted'],
  returned: ['Returned', 'muted'],
};
const TABS = { open: 'Open', new: 'New', confirmed: 'Confirmed', packed: 'Packed', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled', '': 'All' };
const SOURCES = { phone: 'Phone', whatsapp: 'WhatsApp', 'walk-in': 'Walk-in', visit: 'Sales visit', enquiry: 'Website enquiry', website: 'Website', other: 'Other' };
const STEP_LABEL = { confirmed: 'Confirm', packing: 'Start packing', packed: 'Packed', dispatched: 'Dispatch', delivered: 'Delivered' };
export const printUrl = (kind, id) => `/admin/print/${kind}/${id}`;

// Orders taken by phone, WhatsApp, walk-in or a sales visit. Each moves through
// its steps; confirming checks credit and reserves bags, dispatching invoices
// it (if not already) and takes the bags out of stock.
export default function Orders() {
  const { allowed } = useDash();
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null); // order id or 'new'
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error, reload } = useLoad(() => api.sales.orders(tab, search), [tab, search]);

  if (error?.code === 'no-database') return <NotConnected title="Orders" />;
  return (
    <div className="dash-page">
      <PageHead
        title="Orders"
        intro="Take an order, confirm it (credit and stock are checked), pack, dispatch and invoice it."
        range={false}
        actions={
          allowed('editor') && (
            <button type="button" className="dash-btn" onClick={() => setOpen('new')}>
              <Icon name="plus" /> New order
            </button>
          )
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      <Card>
        <div className="dash-filters">
          <div className="dash-seg biz-lists" role="group" aria-label="Show">
            {Object.entries(TABS).map(([key, label]) => (
              <button key={key || 'all'} type="button" className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
          <label className="dash-search">
            <Icon name="search" />
            <input placeholder="Order, invoice, customer, mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {loading && !data && <Loading />}
        {data &&
          (data.orders.length ? (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th className="dash-num">Amount</th>
                    <th>Step</th>
                    <th>Invoice</th>
                    <th className="dash-num">Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id} className="dash-row-link" onClick={() => setOpen(o.id)}>
                      <td className="dash-nowrap">
                        <strong>{o.number}</strong>
                      </td>
                      <td className="dash-nowrap">{niceDate(o.order_date)}</td>
                      <td>{o.customer}</td>
                      <td className="dash-num">{money(o.invoice_total ?? o.subtotal_paise)}</td>
                      <td>
                        <Badge tone={STATUS[o.status][1]}>{STATUS[o.status][0]}</Badge>
                      </td>
                      <td className="dash-nowrap dash-muted">{o.invoice_number || ''}</td>
                      <td className="dash-num">{o.balance_paise ? money(o.balance_paise) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="cart" title={search ? 'No orders match' : 'No orders here yet'} />
          ))}
      </Card>
      {open === 'new' && (
        <NewOrder
          onClose={() => setOpen(null)}
          onCreated={(order) => {
            setOpen(order.id);
            reload();
          }}
        />
      )}
      {open && open !== 'new' && <OrderDrawer id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}

export function CustomerPicker({ value, onPick }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  useEffect(() => {
    if (value || q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => api.business.parties('customer', q).then((d) => setFound(d.parties.filter((p) => p.active).slice(0, 8))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, value]);
  if (value) {
    return (
      <div className="biz-picked">
        <div>
          <strong>{value.display_name}</strong>
          <span className="dash-muted dash-block">{[phoneShow(value.phone), value.gstin, value.price_list && `${value.price_list} prices`].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className="dash-link" onClick={() => onPick(null)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="biz-picker">
      <label className="dash-search">
        <Icon name="search" />
        <input autoFocus placeholder="Type the customer's name, mobile or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {found.length > 0 && (
        <ul className="biz-list biz-pick-list">
          {found.map((p) => (
            <li key={p.id}>
              <button type="button" className="biz-pick" onClick={() => onPick(p)}>
                <strong>{p.display_name}</strong> <span className="dash-muted">{[phoneShow(p.phone), p.city].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !found.length && <p className="dash-muted dash-small">No customer found. Add them first under Customers and suppliers.</p>}
    </div>
  );
}

function NewOrder({ onClose, onCreated }) {
  const { allowed } = useDash();
  const canSetPrice = allowed('admin');
  const items = useLoad(() => api.business.items(), []);
  const [party, setParty] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ source: 'phone', addressId: '', notes: '' });
  const [lines, setLines] = useState([{ itemId: '', qty: '1', price: '' }]);
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const sellable = (items.data?.items || []).filter((i) => i.kind === 'finished' && i.active);

  useEffect(() => {
    setDetail(null);
    if (party) api.business.party(party.id).then(setDetail).catch(setProblem);
  }, [party]);
  const body = () => ({
    partyId: party?.id,
    source: form.source,
    addressId: form.addressId || null,
    notes: form.notes,
    lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: Number(l.itemId), qty: l.qty, price: canSetPrice && l.price !== '' ? l.price : undefined })),
  });
  // Re-price whenever the order changes.
  useEffect(() => {
    setPreview(null);
    if (!party || !lines.some((l) => l.itemId)) return;
    const t = setTimeout(() => {
      api.sales
        .preview(body())
        .then((p) => {
          setPreview(p);
          setProblem(null);
        })
        .catch(setProblem);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, lines, form.addressId]);

  const setLine = (i, key) => (e) => setLines(lines.map((l, x) => (x === i ? { ...l, [key]: e.target.value } : l)));
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      onCreated(await api.sales.createOrder(body()));
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title="New order" wide>
      <div className="biz-form">
        <div className="dash-field biz-wide">
          <span className="dash-field__label">Customer</span>
          <CustomerPicker value={party} onPick={setParty} />
        </div>
        {party && (
          <>
            <label className="dash-field">
              <span className="dash-field__label">Order came by</span>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {Object.entries(SOURCES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Deliver to</span>
              <select value={form.addressId} onChange={(e) => setForm({ ...form, addressId: e.target.value })}>
                <option value="">{detail?.addresses?.some((a) => a.active) ? 'Their usual address' : 'Pickup / no address on file'}</option>
                {(detail?.addresses || [])
                  .filter((a) => a.active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {[a.label, a.line1, a.city].filter(Boolean).join(', ')}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
      </div>

      {party && (
        <section className="biz-section">
          <h3>Packs</h3>
          <div className="biz-lines">
            {lines.map((l, i) => {
              const p = preview?.lines?.[lines.slice(0, i).filter((x) => x.itemId).length];
              return (
                <div key={i} className="biz-line">
                  <select value={l.itemId} onChange={setLine(i, 'itemId')} aria-label={`Pack ${i + 1}`}>
                    <option value="">Choose a pack…</option>
                    {sellable.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                  <input value={l.qty} onChange={setLine(i, 'qty')} inputMode="numeric" aria-label="Bags" className="biz-qty" />
                  <span className="dash-muted dash-small">bags</span>
                  {canSetPrice && <input value={l.price} onChange={setLine(i, 'price')} inputMode="decimal" placeholder="Auto price" aria-label="Price per bag (₹)" className="biz-price" />}
                  {l.itemId && p && (
                    <span className="dash-small biz-line__info">
                      {money(p.unitPaise)} × {p.qty} = <strong>{money(p.unitPaise * p.qty)}</strong>{' '}
                      <span className="dash-muted">({p.source === 'special' ? 'special price' : p.source === 'manual' ? 'typed' : p.source.replace('list:', '') + ' list'})</span>{' '}
                      {p.available < p.qty ? <Badge tone="bad">only {p.available} free</Badge> : <span className="dash-muted">· {p.available} free</span>}
                    </span>
                  )}
                  {lines.length > 1 && (
                    <button type="button" className="dash-icon-btn" aria-label="Remove line" onClick={() => setLines(lines.filter((_, x) => x !== i))}>
                      <Icon name="close" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setLines([...lines, { itemId: '', qty: '1', price: '' }])}>
            <Icon name="plus" /> Add another pack
          </button>
          <label className="dash-field" style={{ marginTop: 12 }}>
            <span className="dash-field__label">Notes (optional)</span>
            <textarea className="dash-textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery time, landmark, anything the packers should know" />
          </label>
        </section>
      )}

      {preview && (
        <div className="biz-box">
          <dl className="dash-facts">
            <div>
              <dt>Order total</dt>
              <dd>
                <strong>{money(preview.totalPaise)}</strong> {preview.includesGst ? `(includes GST ${money(preview.taxPaise)})` : `(+ GST ${money(preview.taxPaise)})`}
              </dd>
            </div>
            <div>
              <dt>Deliver to</dt>
              <dd>{preview.shipTo ? `${preview.shipTo.city}, ${stateName(preview.shipTo.state_code)}` : 'Pickup / not given'}</dd>
            </div>
            <div>
              <dt>Credit</dt>
              <dd>
                {preview.credit.ok ? <Badge tone="good">OK</Badge> : <Badge tone="bad">Needs approval</Badge>} owes {money(preview.credit.netDuePaise)}
                {preview.credit.limitPaise > 0 && ` · limit ${money(preview.credit.limitPaise)}`}
              </dd>
            </div>
          </dl>
          {!preview.credit.ok && <p className="dash-small biz-warn">Confirming will need an Admin or Owner: {preview.credit.problems.join('; ')}.</p>}
        </div>
      )}
      {problem && <div className="dash-error">{problem.message}</div>}
      <div className="dash-row" style={{ marginTop: 12 }}>
        <button type="button" className="dash-btn" disabled={busy || !preview} onClick={save}>
          {busy ? 'Saving…' : 'Save order'}
        </button>
        <span className="dash-muted dash-small">It is saved as New. Confirm it on the next screen to reserve the bags.</span>
      </div>
    </Drawer>
  );
}

function OrderDrawer({ id, onClose, onChanged }) {
  const { allowed } = useDash();
  const isAdmin = allowed('admin');
  const canWork = allowed('editor');
  const [order, setOrder] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(null); // { reason }
  const [panel, setPanel] = useState(null); // 'dispatch' | 'return'

  useEffect(() => {
    api.sales.order(id).then(setOrder).catch(setProblem);
  }, [id]);
  const act = async (fn) => {
    setBusy(true);
    setProblem(null);
    try {
      setOrder(await fn());
      onChanged();
      return true;
    } catch (e) {
      setProblem(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const move = async (to, extra) => {
    const ok = await act(() => api.sales.move(id, to, extra));
    if (ok) setOverride(null);
  };

  if (!order) return <Drawer open onClose={onClose} title="Order">{problem ? <ErrorNote error={problem} /> : <Loading />}</Drawer>;
  const live = order.invoices.find((i) => i.status === 'issued');
  const steps = order.next.filter((s) => !['cancelled', 'returned'].includes(s));
  return (
    <Drawer open onClose={onClose} title={`${order.number} · ${order.customer}`} wide>
      <div className="biz-order-head">
        <Badge tone={STATUS[order.status][1]}>{STATUS[order.status][0]}</Badge>
        <span className="dash-muted dash-small">
          {niceDate(order.order_date)} · {SOURCES[order.source] || order.source} · {order.price_list ? `${order.price_list} prices` : 'website prices'} · {order.includes_gst ? 'prices include GST' : 'GST added'}
        </span>
      </div>
      <dl className="dash-facts">
        <div>
          <dt>Customer</dt>
          <dd>
            {order.customer} {order.phone && <span className="dash-muted">· {phoneShow(order.phone)}</span>} {order.gstin && <span className="dash-muted">· {order.gstin}</span>}
          </dd>
        </div>
        <div>
          <dt>Deliver to</dt>
          <dd>{order.ship_to ? [order.ship_to.line1, order.ship_to.line2, order.ship_to.city, order.ship_to.pincode].filter(Boolean).join(', ') + ` · ${stateName(order.ship_to.state_code)}` : 'Pickup / not given'}</dd>
        </div>
        {order.notes && (
          <div>
            <dt>Notes</dt>
            <dd>{order.notes}</dd>
          </div>
        )}
      </dl>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Pack</th>
              <th className="dash-num">Bags</th>
              <th className="dash-num">Price</th>
              <th className="dash-num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.name} <span className="dash-muted dash-small">{l.sku_code}</span>
                </td>
                <td className="dash-num">{l.qty}</td>
                <td className="dash-num">{money(l.unit_price_paise)}</td>
                <td className="dash-num">{money(l.unit_price_paise * l.qty)}</td>
                <td className="dash-small">
                  {order.status === 'new' && (l.available < l.qty ? <Badge tone="bad">only {l.available} free</Badge> : <span className="dash-muted">{l.available} free</span>)}
                  {l.returned > 0 && <Badge tone="muted">{l.returned} returned</Badge>}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}>
                <strong>Order value</strong>
              </td>
              <td className="dash-num">
                <strong>{money(order.subtotal_paise)}</strong>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {order.credit_override_reason && <p className="dash-small biz-warn">Confirmed over the credit check by {order.credit_override_by}: {order.credit_override_reason}</p>}
      {order.status === 'new' && !order.credit.ok && <p className="dash-small biz-warn">Credit check: {order.credit.problems.join('; ')}.</p>}
      {problem && <div className="dash-error">{problem.message}</div>}

      {canWork && (
        <div className="dash-row biz-actions">
          {steps.map((s) => (
            <button key={s} type="button" className="dash-btn" disabled={busy} onClick={() => move(s)}>
              {STEP_LABEL[s] || s}
            </button>
          ))}
          {canWork && !live && ['confirmed', 'packing', 'packed'].includes(order.status) && (
            <button type="button" className="dash-btn dash-btn--ghost" disabled={busy} onClick={() => act(() => api.sales.invoice(id))}>
              Make invoice now
            </button>
          )}
          {!['new', 'cancelled'].includes(order.status) && (
            <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setPanel(panel === 'dispatch' ? null : 'dispatch')}>
              Dispatch details
            </button>
          )}
          {isAdmin && ['dispatched', 'delivered'].includes(order.status) && (
            <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setPanel(panel === 'return' ? null : 'return')}>
              Return bags
            </button>
          )}
          {isAdmin && order.next.includes('cancelled') && (
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt('Why is this order cancelled?');
                if (reason) move('cancelled', { reason });
              }}
            >
              Cancel order
            </button>
          )}
        </div>
      )}
      {problem?.code === 'credit' && isAdmin && (
        <div className="biz-box">
          <h3>Confirm anyway?</h3>
          <p className="dash-small">As Admin or Owner you can confirm over the credit check. The reason is kept on the order.</p>
          <label className="dash-field">
            <span className="dash-field__label">Reason</span>
            <input value={override?.reason || ''} onChange={(e) => setOverride({ reason: e.target.value })} placeholder="e.g. Owner agreed; payment promised Friday" />
          </label>
          <button type="button" className="dash-btn" disabled={busy || !override?.reason?.trim()} onClick={() => move('confirmed', { override: true, reason: override.reason })} style={{ marginTop: 8 }}>
            Confirm over the credit check
          </button>
        </div>
      )}

      {panel === 'dispatch' && <DispatchForm order={order} canWork={canWork} onSaved={(o) => (setOrder(o), setPanel(null), onChanged())} />}
      {panel === 'return' && <ReturnForm order={order} onSaved={(o) => (setOrder(o), setPanel(null), onChanged())} />}

      {(order.invoices.length > 0 || order.creditNotes.length > 0) && (
        <section className="biz-section">
          <h3>Invoice</h3>
          <ul className="biz-list">
            {order.invoices.map((inv) => (
              <li key={inv.id} className={inv.status === 'cancelled' ? 'is-off' : ''}>
                <div>
                  <strong>{inv.number}</strong> · {niceDate(inv.invoice_date)} · {money(inv.total_paise)}
                  {inv.status === 'cancelled' ? <Badge tone="muted">Cancelled</Badge> : inv.balance_paise > 0 ? <Badge tone="warn">{money(inv.balance_paise)} unpaid</Badge> : <Badge tone="good">Paid</Badge>}
                  {inv.cancel_reason && <span className="dash-muted dash-block">{inv.cancel_reason}</span>}
                </div>
                <div className="dash-row">
                  <a className="dash-link" href={printUrl('invoice', inv.id)} target="_blank" rel="noreferrer">
                    Print / PDF
                  </a>
                  {isAdmin && inv.status === 'issued' && ['confirmed', 'packing', 'packed'].includes(order.status) && (
                    <button
                      type="button"
                      className="dash-link"
                      onClick={() => {
                        const reason = window.prompt(`Why cancel invoice ${inv.number}? The number is not reused.`);
                        if (reason) act(() => api.sales.cancelInvoice(inv.id, reason).then(() => api.sales.order(id)));
                      }}
                    >
                      Cancel invoice
                    </button>
                  )}
                </div>
              </li>
            ))}
            {order.creditNotes.map((cn) => (
              <li key={`cn${cn.id}`}>
                <div>
                  Credit note <strong>{cn.number}</strong> · {niceDate(cn.note_date)} · {money(cn.total_paise)}
                </div>
                <a className="dash-link" href={printUrl('credit-note', cn.id)} target="_blank" rel="noreferrer">
                  Print / PDF
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.dispatch && (
        <section className="biz-section">
          <h3>Dispatch</h3>
          <p className="dash-small">
            {[
              order.dispatch.dispatched_on && `Sent ${niceDate(order.dispatch.dispatched_on)}`,
              order.dispatch.vehicle_no,
              order.dispatch.driver_name && `driver ${order.dispatch.driver_name} ${phoneShow(order.dispatch.driver_phone)}`,
              order.dispatch.transporter,
              order.dispatch.lr_no && `LR ${order.dispatch.lr_no}`,
              order.dispatch.eway_bill_no && `e-way bill ${order.dispatch.eway_bill_no}`,
            ]
              .filter(Boolean)
              .join(' · ') || 'No details yet.'}
          </p>
        </section>
      )}

      <section className="biz-section">
        <h3>History</h3>
        <ul className="biz-history">
          {order.events.map((e) => (
            <li key={e.id}>
              <span className="dash-muted dash-small" title={when(e.at)}>
                {ago(e.at)}
              </span>{' '}
              <strong>{e.action}</strong> {e.detail && <span>· {e.detail}</span>} <span className="dash-muted dash-small">by {e.actor}</span>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}

function DispatchForm({ order, canWork, onSaved }) {
  const d = order.dispatch || {};
  const [form, setForm] = useState({
    dispatchedOn: d.dispatched_on || '',
    vehicleNo: d.vehicle_no || '',
    driverName: d.driver_name || '',
    driverPhone: d.driver_phone ? d.driver_phone.slice(3) : '',
    transporter: d.transporter || '',
    lrNo: d.lr_no || '',
    lrDate: d.lr_date || '',
    ewayBillNo: d.eway_bill_no || '',
    ewayValidUntil: d.eway_valid_until || '',
    notes: d.notes || '',
  });
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const err = (k) => problem?.fields?.[k] && <span className="dash-field-error">{problem.fields[k]}</span>;
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await api.sales.dispatch(order.id, form));
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  const field = (k, label, props = {}) => (
    <label className="dash-field">
      <span className="dash-field__label">{label}</span>
      <input value={form[k]} onChange={set(k)} {...props} />
      {err(k)}
    </label>
  );
  return (
    <form className="biz-box" onSubmit={save}>
      <h3>Dispatch details</h3>
      <fieldset className="biz-form biz-fieldset" disabled={!canWork}>
        {field('dispatchedOn', 'Sent on', { type: 'date' })}
        {field('vehicleNo', 'Vehicle number', { placeholder: 'TN 37 AB 1234' })}
        {field('driverName', 'Driver')}
        {field('driverPhone', 'Driver mobile', { inputMode: 'tel' })}
        {field('transporter', 'Transporter')}
        {field('lrNo', 'LR number')}
        {field('lrDate', 'LR date', { type: 'date' })}
        {field('ewayBillNo', 'E-way bill number', { inputMode: 'numeric', maxLength: 12 })}
        {field('ewayValidUntil', 'E-way bill valid until', { type: 'date' })}
      </fieldset>
      {problem && <div className="dash-error">{problem.message}</div>}
      {canWork && (
        <button type="submit" className="dash-btn dash-btn--sm" disabled={busy} style={{ marginTop: 10 }}>
          {busy ? 'Saving…' : 'Save dispatch details'}
        </button>
      )}
    </form>
  );
}

function ReturnForm({ order, onSaved }) {
  const [rows, setRows] = useState(order.lines.map((l) => ({ orderLineId: l.id, qty: '', condition: 'good', max: l.qty - l.returned, name: l.name })));
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await api.sales.recordReturn(order.id, { lines: rows.filter((r) => Number(r.qty) > 0), notes }));
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="biz-box" onSubmit={save}>
      <h3>Bags returned</h3>
      <p className="dash-small dash-muted">Good bags go back into stock; damaged bags are kept apart. A credit note is made for what came back.</p>
      {rows.map((r, i) => (
        <div key={r.orderLineId} className="biz-line">
          <span className="biz-line__name">{r.name}</span>
          <input value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} inputMode="numeric" className="biz-qty" placeholder="0" aria-label={`Bags of ${r.name}`} />
          <span className="dash-muted dash-small">of {r.max}</span>
          <select value={r.condition} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, condition: e.target.value } : x)))} aria-label="Condition">
            <option value="good">Good, back to stock</option>
            <option value="damaged">Damaged</option>
          </select>
        </div>
      ))}
      <label className="dash-field" style={{ marginTop: 8 }}>
        <span className="dash-field__label">Why (optional)</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Torn bags, customer over-ordered" />
      </label>
      {problem && <div className="dash-error">{problem.message}</div>}
      <button type="submit" className="dash-btn dash-btn--sm" disabled={busy} style={{ marginTop: 10 }}>
        {busy ? 'Saving…' : 'Record return and credit note'}
      </button>
    </form>
  );
}
