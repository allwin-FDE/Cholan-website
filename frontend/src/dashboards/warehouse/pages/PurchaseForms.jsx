import { useEffect, useMemo, useState } from 'react';
import { api } from '../../shared/api.js';
import { Drawer, Icon, useLoad } from '../../shared/ui.jsx';
import { money, niceDate, todayIst } from './shared.js';
import { CustomerPicker } from './Orders.jsx';

// The forms of the Purchases page: a purchase order, goods received (stock
// comes in), a supplier's bill, and a payment to a supplier. Amounts are typed
// in rupees; the server works out GST and checks everything again.

export const PAY_METHODS = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque', other: 'Other' };
const KINDS = { finished: 'Packs', raw: 'Rice and paddy (loose)', packing: 'Packing material', other: 'Other' };
const pct = (bp) => (bp == null ? '' : String(bp / 100));
const rupeesIn = (paise) => (paise == null ? '' : String(paise / 100));
const itemLabel = (i) => (i.pack_label && !i.name.includes(i.pack_label) ? `${i.name} ${i.pack_label}` : i.name);

function useBuyables() {
  const items = useLoad(() => api.business.items(), []);
  return useMemo(() => (items.data?.items || []).filter((i) => i.active), [items.data]);
}

function useBranches() {
  const b = useLoad(() => api.inward.branches(), []);
  return useMemo(() => (b.data?.branches || []).filter((x) => x.active), [b.data]);
}

// Places where stock can arrive: the godowns and shelves of branches that hold stock.
const placesOf = (branches) =>
  branches
    .filter((b) => b.holds_stock)
    .flatMap((b) => b.locations.filter((l) => l.active && ['godown', 'shelf'].includes(l.kind)).map((l) => ({ ...l, branch: b.name })));

function ItemSelect({ items, value, onChange, label, blank = 'Choose an item…' }) {
  return (
    <select value={value} onChange={onChange} aria-label={label}>
      <option value="">{blank}</option>
      {Object.entries(KINDS).map(([kind, name]) => {
        const group = items.filter((i) => i.kind === kind);
        return group.length ? (
          <optgroup key={kind} label={name}>
            {group.map((i) => (
              <option key={i.id} value={i.id}>
                {itemLabel(i)}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

function useSave(run, onSaved) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const save = async (event) => {
    event?.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onSaved(await run());
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, problem, setProblem, save };
}

const FieldError = ({ problem, name }) => (problem?.fields?.[name] ? <span className="dash-field-error">{problem.fields[name]}</span> : null);

function Field({ label, children, wide, problem, name }) {
  return (
    <label className={`dash-field${wide ? ' biz-wide' : ''}`}>
      <span className="dash-field__label">{label}</span>
      {children}
      <FieldError problem={problem} name={name} />
    </label>
  );
}

function SupplierField({ party, setParty, problem }) {
  return (
    <div className="dash-field biz-wide">
      <span className="dash-field__label">Supplier</span>
      <CustomerPicker type="supplier" value={party} onPick={setParty} />
      <FieldError problem={problem} name="partyId" />
    </div>
  );
}

function BranchField({ branches, value, onChange, problem }) {
  if (branches.length < 2) return null;
  return (
    <Field label="Branch" problem={problem} name="branchId">
      <select value={value} onChange={onChange}>
        <option value="">Main branch</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

const RemoveLine = ({ onClick }) => (
  <button type="button" className="dash-icon-btn" aria-label="Remove line" onClick={onClick}>
    <Icon name="close" />
  </button>
);

function Footer({ busy, problem, label, disabled }) {
  return (
    <>
      {problem && <div className="dash-error">{problem.message}</div>}
      <button type="submit" className="dash-btn" disabled={busy || disabled} style={{ marginTop: 12 }}>
        {busy ? 'Saving…' : label}
      </button>
    </>
  );
}

// ---- Purchase order (Admin and Owner) ----
const blankBuy = () => ({ itemId: '', qty: '', rate: '', gstRate: '' });

export function NewPurchaseOrder({ onClose, onSaved }) {
  const items = useBuyables();
  const branches = useBranches();
  const [party, setParty] = useState(null);
  const [form, setForm] = useState({ branchId: '', orderDate: todayIst(), expectedOn: '', notes: '' });
  const [lines, setLines] = useState([blankBuy()]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (i, k) => (e) =>
    setLines(
      lines.map((l, x) => {
        if (x !== i) return l;
        const next = { ...l, [k]: e.target.value };
        if (k === 'itemId') next.gstRate = pct(items.find((it) => String(it.id) === e.target.value)?.gst_rate_bp);
        return next;
      }),
    );
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * Math.round((Number(l.rate) || 0) * 100), 0);
  const { busy, problem, save } = useSave(
    () =>
      api.inward.createPurchaseOrder({
        partyId: party?.id,
        ...form,
        branchId: form.branchId || null,
        lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: Number(l.itemId), qty: l.qty, rate: l.rate || '0', gstRate: l.gstRate })),
      }),
    onSaved,
  );
  return (
    <Drawer open onClose={onClose} title="New purchase order" wide>
      <form onSubmit={save}>
        <div className="biz-form">
          <SupplierField party={party} setParty={setParty} problem={problem} />
          <BranchField branches={branches} value={form.branchId} onChange={set('branchId')} problem={problem} />
          <Field label="Order date" problem={problem} name="orderDate">
            <input type="date" value={form.orderDate} onChange={set('orderDate')} />
          </Field>
          <Field label="Expected on (optional)" problem={problem} name="expectedOn">
            <input type="date" value={form.expectedOn} onChange={set('expectedOn')} />
          </Field>
        </div>
        <section className="biz-section">
          <h3>What to buy</h3>
          <p className="dash-muted dash-small">Item · quantity · rate per unit before GST (₹) · GST %</p>
          <div className="biz-lines">
            {lines.map((l, i) => (
              <div key={i} className="biz-line">
                <ItemSelect items={items} value={l.itemId} onChange={setLine(i, 'itemId')} label={`Item ${i + 1}`} />
                <input value={l.qty} onChange={setLine(i, 'qty')} inputMode="numeric" placeholder="Qty" aria-label="Quantity" className="biz-qty" />
                <input value={l.rate} onChange={setLine(i, 'rate')} inputMode="decimal" placeholder="Rate ₹" aria-label="Rate per unit before GST (₹)" className="biz-price" />
                <input value={l.gstRate} onChange={setLine(i, 'gstRate')} inputMode="decimal" placeholder="GST %" aria-label="GST %" className="biz-qty" />
                {lines.length > 1 && <RemoveLine onClick={() => setLines(lines.filter((_, x) => x !== i))} />}
              </div>
            ))}
          </div>
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setLines([...lines, blankBuy()])}>
            <Icon name="plus" /> Add another item
          </button>
          {total > 0 && <p className="dash-small">Value before GST: <strong>{money(total)}</strong></p>}
          <Field label="Notes (optional)" wide>
            <textarea className="dash-textarea" rows={2} value={form.notes} onChange={set('notes')} placeholder="Quality, delivery terms, anything agreed" />
          </Field>
        </section>
        <Footer busy={busy} problem={problem} label="Save purchase order" disabled={!party} />
      </form>
    </Drawer>
  );
}

// ---- Goods received: stock comes in ----
const blankIn = () => ({ itemId: '', orderLineId: null, qtyReceived: '', qtyAccepted: '', rejectReason: '', batchCode: '', bestBefore: '' });

export function NewGoodsReceived({ start, onClose, onSaved }) {
  const items = useBuyables();
  const branches = useBranches();
  const places = useMemo(() => placesOf(branches), [branches]);
  const [party, setParty] = useState(start?.party || null);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({ orderId: start?.orderId ? String(start.orderId) : '', locationId: '', receivedOn: todayIst(), vehicleNo: '', weighbridgeTicket: '', grossKg: '', tareKg: '', moisturePct: '', supplierDocNo: '', notes: '' });
  const [lines, setLines] = useState([blankIn()]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (i, k) => (e) => setLines(lines.map((l, x) => (x === i ? { ...l, [k]: e.target.value } : l)));

  useEffect(() => {
    if (!form.locationId && places.length) setForm((f) => ({ ...f, locationId: String(places[0].id) }));
  }, [places, form.locationId]);
  // This supplier's purchase orders still waiting for goods.
  useEffect(() => {
    setOrders([]);
    if (party) api.inward.purchaseOrders('open').then((d) => setOrders(d.orders.filter((o) => o.party_id === party.id))).catch(() => {});
  }, [party]);
  // Choosing an order fills in what is still to come on it.
  useEffect(() => {
    if (!form.orderId) return;
    api.inward
      .purchaseOrder(form.orderId)
      .then((po) => {
        setParty((p) => p || { id: po.party_id, display_name: po.supplier });
        const left = po.lines.filter((l) => l.qty > l.qty_received).map((l) => ({ ...blankIn(), itemId: String(l.item_id), orderLineId: l.id, qtyReceived: String(l.qty - l.qty_received) }));
        if (left.length) setLines(left);
      })
      .catch(() => {});
  }, [form.orderId]);

  const net = Number(form.grossKg) && Number(form.tareKg) ? Number(form.grossKg) - Number(form.tareKg) : null;
  const { busy, problem, save } = useSave(
    () =>
      api.inward.createGoodsReceived({
        partyId: party?.id,
        ...form,
        orderId: form.orderId || null,
        locationId: Number(form.locationId) || null,
        lines: lines
          .filter((l) => l.itemId)
          .map((l) => ({
            itemId: Number(l.itemId),
            orderLineId: l.orderLineId,
            qtyReceived: l.qtyReceived,
            qtyAccepted: l.qtyAccepted,
            rejectReason: l.rejectReason,
            batch: { code: l.batchCode, bestBefore: l.bestBefore || null },
          })),
      }),
    onSaved,
  );
  return (
    <Drawer open onClose={onClose} title="Record goods received" wide>
      <form onSubmit={save}>
        <p className="dash-muted dash-small">The accepted quantity goes into stock straight away, as a new batch.</p>
        <div className="biz-form">
          <SupplierField party={party} setParty={setParty} problem={problem} />
          {party && orders.length > 0 && (
            <Field label="Against purchase order" problem={problem} name="orderId">
              <select value={form.orderId} onChange={set('orderId')}>
                <option value="">No order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} · {niceDate(o.order_date)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Received into" problem={problem} name="locationId">
            <select value={form.locationId} onChange={set('locationId')}>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {places.length > 1 && branches.length > 1 ? `${p.branch} · ` : ''}
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date received" problem={problem} name="receivedOn">
            <input type="date" value={form.receivedOn} onChange={set('receivedOn')} />
          </Field>
          <Field label="Supplier's delivery note / invoice no. (optional)" problem={problem} name="supplierDocNo">
            <input value={form.supplierDocNo} onChange={set('supplierDocNo')} />
          </Field>
          <Field label="Vehicle no. (optional)" problem={problem} name="vehicleNo">
            <input value={form.vehicleNo} onChange={set('vehicleNo')} placeholder="TN 37 AB 1234" />
          </Field>
        </div>
        <details className="biz-section">
          <summary className="dash-small">Weighbridge and moisture (for loose rice and paddy)</summary>
          <div className="biz-form">
            <Field label="Weighbridge ticket" problem={problem} name="weighbridgeTicket">
              <input value={form.weighbridgeTicket} onChange={set('weighbridgeTicket')} />
            </Field>
            <Field label="Loaded weight (kg)" problem={problem} name="grossKg">
              <input value={form.grossKg} onChange={set('grossKg')} inputMode="decimal" />
            </Field>
            <Field label="Empty vehicle (kg)" problem={problem} name="tareKg">
              <input value={form.tareKg} onChange={set('tareKg')} inputMode="decimal" />
            </Field>
            <Field label="Moisture %" problem={problem} name="moisturePct">
              <input value={form.moisturePct} onChange={set('moisturePct')} inputMode="decimal" />
            </Field>
          </div>
          {net > 0 && <p className="dash-small">Net weight: <strong>{net.toLocaleString('en-IN')} kg</strong></p>}
        </details>
        <section className="biz-section">
          <h3>What arrived</h3>
          <p className="dash-muted dash-small">Item · how many arrived · how many accepted (empty = all) · batch code (empty = made for you) · best before</p>
          <div className="biz-lines">
            {lines.map((l, i) => {
              const short = l.qtyAccepted !== '' && Number(l.qtyAccepted) < Number(l.qtyReceived);
              return (
                <div key={i} className="biz-line biz-line--wrap">
                  <ItemSelect items={items} value={l.itemId} onChange={setLine(i, 'itemId')} label={`Item ${i + 1}`} />
                  <input value={l.qtyReceived} onChange={setLine(i, 'qtyReceived')} inputMode="numeric" placeholder="Arrived" aria-label="Quantity arrived" className="biz-qty" />
                  <input value={l.qtyAccepted} onChange={setLine(i, 'qtyAccepted')} inputMode="numeric" placeholder="Accepted" aria-label="Quantity accepted (empty = all)" className="biz-qty" title="Leave empty if all were accepted" />
                  <input value={l.batchCode} onChange={setLine(i, 'batchCode')} placeholder="Batch (auto)" aria-label="Batch code (optional)" className="biz-price" />
                  <input type="date" value={l.bestBefore} onChange={setLine(i, 'bestBefore')} aria-label="Best before (optional)" title="Best before (optional)" />
                  {lines.length > 1 && <RemoveLine onClick={() => setLines(lines.filter((_, x) => x !== i))} />}
                  {short && <input value={l.rejectReason} onChange={setLine(i, 'rejectReason')} placeholder={`Why ${Number(l.qtyReceived) - Number(l.qtyAccepted)} rejected?`} aria-label="Reason for rejecting" className="biz-wide" />}
                </div>
              );
            })}
          </div>
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setLines([...lines, blankIn()])}>
            <Icon name="plus" /> Add another item
          </button>
          <Field label="Notes (optional)" wide>
            <textarea className="dash-textarea" rows={2} value={form.notes} onChange={set('notes')} />
          </Field>
        </section>
        <Footer busy={busy} problem={problem} label="Save and add to stock" disabled={!party || !places.length} />
        {!places.length && <p className="dash-small biz-warn">No godown is set up to receive stock.</p>}
      </form>
    </Drawer>
  );
}

// ---- Supplier bill ----
const blankBill = () => ({ itemId: '', description: '', qty: '', unit: '', rate: '', gstRate: '', hsn: '' });

export function NewBill({ start, onClose, onSaved }) {
  const items = useBuyables();
  const branches = useBranches();
  const [party, setParty] = useState(start?.party || null);
  const [receipts, setReceipts] = useState([]);
  const [form, setForm] = useState({ goodsReceivedId: start?.goodsReceivedId ? String(start.goodsReceivedId) : '', branchId: '', supplierBillNo: '', billDate: todayIst(), dueDate: '', supplierGstin: '', totalAsBilled: '', itcEligible: true, notes: '' });
  const [lines, setLines] = useState([blankBill()]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setLine = (i, k) => (e) =>
    setLines(
      lines.map((l, x) => {
        if (x !== i) return l;
        const next = { ...l, [k]: e.target.value };
        if (k === 'itemId') {
          const it = items.find((t) => String(t.id) === e.target.value);
          if (it) Object.assign(next, { gstRate: pct(it.gst_rate_bp), unit: it.uom || '', hsn: it.hsn || '', description: '' });
        }
        return next;
      }),
    );

  useEffect(() => {
    setReceipts([]);
    if (party) {
      // A supplier passed in from goods received carries only its name: look up its GSTIN.
      if (party.gstin === undefined) api.business.party(party.id).then((p) => setForm((f) => ({ ...f, supplierGstin: p.gstin || '' }))).catch(() => {});
      else setForm((f) => ({ ...f, supplierGstin: party.gstin || '' }));
      api.inward.goodsReceived().then((d) => setReceipts(d.receipts.filter((r) => r.party_id === party.id && !r.bill_number))).catch(() => {});
    }
  }, [party]);
  // Billing goods received fills in what was accepted, at the order's rates.
  useEffect(() => {
    if (!form.goodsReceivedId) return;
    api.inward
      .goodsReceivedNote(form.goodsReceivedId)
      .then((g) => {
        setParty((p) => p || { id: g.party_id, display_name: g.supplier });
        const got = g.lines
          .filter((l) => l.qty_accepted > 0)
          .map((l) => ({ ...blankBill(), itemId: String(l.item_id), qty: String(l.qty_accepted), unit: l.uom || '', rate: rupeesIn(l.order_rate_paise), gstRate: pct(l.gst_rate_bp), hsn: l.hsn || '' }));
        if (got.length) setLines(got);
        if (g.supplier_doc_no) setForm((f) => ({ ...f, supplierBillNo: f.supplierBillNo || g.supplier_doc_no }));
      })
      .catch(() => {});
  }, [form.goodsReceivedId]);

  // A rough total as you type; the server works it out exactly.
  const worked = lines.reduce(
    (s, l) => {
      const taxable = Math.round((Number(l.qty) || 0) * Math.round((Number(l.rate) || 0) * 100));
      return { taxable: s.taxable + taxable, tax: s.tax + Math.round((taxable * (Number(l.gstRate) || 0)) / 100) };
    },
    { taxable: 0, tax: 0 },
  );
  const { busy, problem, save } = useSave(
    () =>
      api.inward.createBill({
        partyId: party?.id,
        ...form,
        goodsReceivedId: form.goodsReceivedId || null,
        branchId: form.branchId || null,
        dueDate: form.dueDate || null,
        lines: lines.filter((l) => l.itemId || l.description).map((l) => ({ ...l, itemId: l.itemId ? Number(l.itemId) : null })),
      }),
    onSaved,
  );
  return (
    <Drawer open onClose={onClose} title="Enter a supplier bill" wide>
      <form onSubmit={save}>
        <div className="biz-form">
          <SupplierField party={party} setParty={setParty} problem={problem} />
          {party && receipts.length > 0 && (
            <Field label="For goods received" problem={problem} name="goodsReceivedId">
              <select value={form.goodsReceivedId} onChange={set('goodsReceivedId')}>
                <option value="">Not linked</option>
                {receipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {niceDate(r.received_on)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Supplier's bill no." problem={problem} name="supplierBillNo">
            <input value={form.supplierBillNo} onChange={set('supplierBillNo')} required />
          </Field>
          <Field label="Bill date" problem={problem} name="billDate">
            <input type="date" value={form.billDate} onChange={set('billDate')} />
          </Field>
          <Field label="Due date (empty = their usual terms)" problem={problem} name="dueDate">
            <input type="date" value={form.dueDate} onChange={set('dueDate')} />
          </Field>
          <Field label="Supplier's GSTIN (empty if unregistered)" problem={problem} name="supplierGstin">
            <input value={form.supplierGstin} onChange={set('supplierGstin')} maxLength={15} />
          </Field>
          <BranchField branches={branches} value={form.branchId} onChange={set('branchId')} problem={problem} />
        </div>
        <section className="biz-section">
          <h3>Lines on the bill</h3>
          <p className="dash-muted dash-small">Item · quantity · unit · rate per unit before GST (₹) · GST %</p>
          <div className="biz-lines">
            {lines.map((l, i) => (
              <div key={i} className="biz-line biz-line--wrap">
                <ItemSelect items={items} value={l.itemId} onChange={setLine(i, 'itemId')} label={`Line ${i + 1}`} blank="Not a stock item (type it) →" />
                {!l.itemId && <input value={l.description} onChange={setLine(i, 'description')} placeholder="What it is" aria-label="Description" className="biz-price" />}
                <input value={l.qty} onChange={setLine(i, 'qty')} inputMode="decimal" placeholder="Qty" aria-label="Quantity" className="biz-qty" />
                <input value={l.unit} onChange={setLine(i, 'unit')} placeholder="Unit" aria-label="Unit (bag, kg, nos)" className="biz-qty" />
                <input value={l.rate} onChange={setLine(i, 'rate')} inputMode="decimal" placeholder="Rate ₹" aria-label="Rate per unit before GST (₹)" className="biz-price" />
                <input value={l.gstRate} onChange={setLine(i, 'gstRate')} inputMode="decimal" placeholder="GST %" aria-label="GST %" className="biz-qty" />
                {lines.length > 1 && <RemoveLine onClick={() => setLines(lines.filter((_, x) => x !== i))} />}
              </div>
            ))}
          </div>
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setLines([...lines, blankBill()])}>
            <Icon name="plus" /> Add another line
          </button>
        </section>
        <div className="biz-box">
          <dl className="dash-facts">
            <div>
              <dt>Lines add up to</dt>
              <dd>
                <strong>{money(worked.taxable + worked.tax)}</strong> <span className="dash-muted">({money(worked.taxable)} + GST {money(worked.tax)})</span>
              </dd>
            </div>
          </dl>
          <div className="biz-form">
            <Field label="Total printed on the bill (to check)" problem={problem} name="totalAsBilled">
              <input value={form.totalAsBilled} onChange={set('totalAsBilled')} inputMode="decimal" placeholder="Optional" />
            </Field>
            <label className="dash-check">
              <input type="checkbox" checked={form.itcEligible} onChange={set('itcEligible')} /> GST on this bill can be claimed (input tax credit)
            </label>
          </div>
        </div>
        <Field label="Notes (optional)" wide>
          <textarea className="dash-textarea" rows={2} value={form.notes} onChange={set('notes')} />
        </Field>
        <Footer busy={busy} problem={problem} label="Save bill" disabled={!party} />
      </form>
    </Drawer>
  );
}

// ---- Paying a supplier ----
export function PaySupplier({ startId, onClose, onSaved }) {
  const [party, setParty] = useState(null);
  useEffect(() => {
    if (startId) api.business.party(startId).then((p) => setParty((cur) => cur || p)).catch(() => {});
  }, [startId]);
  const [form, setForm] = useState({ amount: '', method: 'bank', reference: '', date: todayIst(), notes: '' });
  const [mode, setMode] = useState('oldest');
  const [open, setOpen] = useState([]);
  const [split, setSplit] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const { busy, problem, setProblem, save } = useSave(() => {
    const allocations = mode === 'choose' ? Object.entries(split).filter(([, v]) => Number(v) > 0).map(([billId, amount]) => ({ billId: Number(billId), amount })) : undefined;
    return api.inward.pay({ partyId: party?.id, ...form, allocations });
  }, onSaved);
  useEffect(() => {
    setOpen([]);
    setSplit({});
    if (party) api.inward.supplierAccount(party.id).then((a) => setOpen(a.bills.filter((b) => b.balance_paise > 0))).catch(setProblem);
  }, [party, setProblem]);
  const owed = open.reduce((s, b) => s + b.balance_paise, 0);
  return (
    <Drawer open onClose={onClose} title="Pay a supplier" wide>
      <form onSubmit={save}>
        <div className="biz-form">
          <SupplierField party={party} setParty={setParty} problem={problem} />
          <Field label="Amount (₹)" problem={problem} name="amount">
            <input value={form.amount} onChange={set('amount')} inputMode="decimal" required placeholder={owed ? `Owed ${money(owed)}` : ''} />
          </Field>
          <Field label="How" problem={problem} name="method">
            <select value={form.method} onChange={set('method')}>
              {Object.entries(PAY_METHODS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Reference ${['cash', 'other'].includes(form.method) ? '(optional)' : '(UTR / cheque no.)'}`} problem={problem} name="reference">
            <input value={form.reference} onChange={set('reference')} />
          </Field>
          <Field label="Date paid" problem={problem} name="date">
            <input type="date" value={form.date} onChange={set('date')} />
          </Field>
        </div>
        {party && (
          <section className="biz-section">
            <h3>Which bills it pays</h3>
            <div className="dash-seg" role="group" aria-label="Match to">
              <button type="button" className={mode === 'oldest' ? 'is-on' : ''} onClick={() => setMode('oldest')}>
                Oldest first (usual)
              </button>
              <button type="button" className={mode === 'choose' ? 'is-on' : ''} onClick={() => setMode('choose')}>
                Choose bills
              </button>
            </div>
            {open.length === 0 && <p className="dash-muted dash-small">No unpaid bills: the whole amount is kept as an advance to this supplier.</p>}
            {open.length > 0 && (
              <table className="dash-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Date</th>
                    <th className="dash-num">Left to pay</th>
                    {mode === 'choose' && <th className="dash-num">Pay now (₹)</th>}
                  </tr>
                </thead>
                <tbody>
                  {open.map((b) => (
                    <tr key={b.bill_id}>
                      <td>
                        {b.supplier_bill_no} <span className="dash-muted dash-small">{b.number}</span>
                      </td>
                      <td className="dash-nowrap">{niceDate(b.bill_date)}</td>
                      <td className="dash-num">{money(b.balance_paise)}</td>
                      {mode === 'choose' && (
                        <td className="dash-num">
                          <input className="biz-price" value={split[b.bill_id] || ''} onChange={(e) => setSplit({ ...split, [b.bill_id]: e.target.value })} inputMode="decimal" />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        <Footer busy={busy} problem={problem} label="Save payment" disabled={!party} />
      </form>
    </Drawer>
  );
}
