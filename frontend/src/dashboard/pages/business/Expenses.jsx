import { useMemo, useState } from 'react';
import { api, openExpensePhoto, prepareImage } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, BarList, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, Stat, downloadCsv, useLoad } from '../../ui.jsx';
import { money, niceDate, todayIst } from './shared.js';
import NotConnected from './NotConnected.jsx';

// Money spent that is not stock: rent, wages, diesel, electricity, repairs.
// Staff enter expenses (with a photo of the bill); Admin and Owner cancel them
// and keep the list of categories.

const PAID_BY = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque', card: 'Card', other: 'Other' };
const monthStart = () => `${todayIst().slice(0, 8)}01`;

export default function Expenses() {
  const { allowed } = useDash();
  const [range, setRange] = useState({ from: monthStart(), to: todayIst(), categoryId: '' });
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const cats = useLoad(() => api.inward.expenseCategories(), []);
  const list = useLoad(() => api.inward.expenses(range.from, range.to, range.categoryId), [range.from, range.to, range.categoryId]);
  const set = (k) => (e) => setRange({ ...range, [k]: e.target.value });

  const rows = list.data?.expenses || [];
  const active = rows.filter((e) => e.status === 'active');
  const sum = (k) => active.reduce((s, e) => s + (e[k] || 0), 0);
  const byCategory = useMemo(() => {
    const m = new Map();
    for (const e of active) m.set(e.category, (m.get(e.category) || 0) + e.total_paise);
    return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [active]);

  if (list.error?.code === 'no-database') return <NotConnected title="Expenses" />;
  const categories = cats.data?.categories || [];
  return (
    <div className="dash-page">
      <PageHead
        title="Expenses"
        intro="Rent, wages, diesel, electricity, repairs: money spent that isn't stock. Keep a photo of each bill."
        range={false}
        actions={
          <div className="dash-row biz-actions">
            {allowed('editor') && (
              <button type="button" className="dash-btn" onClick={() => setAdding(true)}>
                <Icon name="plus" /> Add expense
              </button>
            )}
            {allowed('admin') && (
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setManaging(true)}>
                <Icon name="tag" /> Categories
              </button>
            )}
          </div>
        }
      />
      <Card>
        <div className="biz-form">
          <label className="dash-field">
            <span className="dash-field__label">From</span>
            <input type="date" value={range.from} onChange={set('from')} />
          </label>
          <label className="dash-field">
            <span className="dash-field__label">To</span>
            <input type="date" value={range.to} onChange={set('to')} />
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Category</span>
            <select value={range.categoryId} onChange={set('categoryId')}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>
      {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <>
          <div className="dash-stats">
            <Stat label="Spent" value={money(sum('total_paise'))} sub={`${active.length} expense${active.length === 1 ? '' : 's'}`} />
            <Stat label="Before GST" value={money(sum('taxable_paise'))} />
            <Stat label="GST claimable" value={money(active.filter((e) => e.itc_eligible).reduce((s, e) => s + e.cgst_paise + e.sgst_paise + e.igst_paise, 0))} />
            <Stat label="Bills without a photo" value={String(active.filter((e) => !e.photo_path).length)} />
          </div>
          {byCategory.length > 1 && (
            <Card title="By category">
              <BarList items={byCategory} format={money} />
            </Card>
          )}
          <Card
            title="Expenses"
            action={
              rows.length > 0 && (
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost dash-btn--sm"
                  onClick={() =>
                    downloadCsv(`expenses-${range.from}-to-${range.to}.csv`, [
                      ['No.', 'Date', 'Category', 'Paid to', 'For', 'Bill no.', 'GSTIN', 'Before GST', 'GST', 'Total', 'Paid by', 'Reference', 'Status'],
                      ...rows.map((e) => [e.number, e.expense_date, e.category, e.payee_name, e.description, e.bill_no || '', e.supplier_gstin || '', e.taxable_paise / 100, (e.cgst_paise + e.sgst_paise + e.igst_paise) / 100, e.total_paise / 100, PAID_BY[e.paid_by], e.reference || '', e.status]),
                    ])
                  }
                >
                  <Icon name="download" /> Download
                </button>
              )
            }
          >
            {rows.length ? (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>For</th>
                      <th>Paid to</th>
                      <th>How</th>
                      <th className="dash-num">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <ExpenseRow key={e.id} e={e} onChanged={list.reload} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon="rupee" title="No expenses in these dates">
                Add one with “Add expense”.
              </Empty>
            )}
          </Card>
        </>
      )}
      {adding && (
        <NewExpense
          categories={categories.filter((c) => c.active)}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      )}
      {managing && <Categories categories={categories} onClose={() => setManaging(false)} onChanged={cats.reload} />}
    </div>
  );
}

function ExpenseRow({ e, onChanged }) {
  const { allowed } = useDash();
  const [busy, setBusy] = useState(false);
  const gst = e.cgst_paise + e.sgst_paise + e.igst_paise;
  const attach = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await api.inward.expensePhoto(e.id, await prepareImage(file));
      onChanged();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr className={e.status === 'cancelled' ? 'is-off' : ''}>
      <td className="dash-nowrap">
        {niceDate(e.expense_date)}
        <span className="dash-muted dash-block dash-small">{e.number}</span>
      </td>
      <td>
        <strong>{e.description}</strong>
        <span className="dash-muted dash-block dash-small">
          {e.category}
          {e.bill_no && ` · bill ${e.bill_no}`}
        </span>
      </td>
      <td>{e.payee_name}</td>
      <td className="dash-small">
        {PAID_BY[e.paid_by]} {e.reference && <span className="dash-muted">· {e.reference}</span>}
      </td>
      <td className="dash-num">
        <strong>{money(e.total_paise)}</strong>
        {gst > 0 && <span className="dash-muted dash-block dash-small">incl. GST {money(gst)}</span>}
      </td>
      <td className="dash-nowrap">
        {e.status === 'cancelled' ? (
          <Badge tone="muted">Cancelled</Badge>
        ) : (
          <span className="dash-row">
            {e.photo_path ? (
              <button type="button" className="dash-link" onClick={() => openExpensePhoto(e.id).catch((err) => window.alert(err.message))}>
                Bill photo
              </button>
            ) : (
              allowed('editor') && (
                <label className="dash-link" style={{ cursor: 'pointer' }}>
                  {busy ? 'Uploading…' : 'Add photo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" hidden onChange={attach} disabled={busy} />
                </label>
              )
            )}
            {allowed('admin') && (
              <button
                type="button"
                className="dash-link"
                onClick={async () => {
                  const reason = window.prompt(`Cancel expense ${e.number}? Give the reason (for example, entered twice).`);
                  if (!reason?.trim()) return;
                  try {
                    await api.inward.cancelExpense(e.id, reason.trim());
                    onChanged();
                  } catch (err) {
                    window.alert(err.message);
                  }
                }}
              >
                Cancel
              </button>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

function NewExpense({ categories, onClose, onSaved }) {
  const branches = useLoad(() => api.inward.branches(), []);
  const active = (branches.data?.branches || []).filter((b) => b.active);
  const [form, setForm] = useState({ categoryId: '', expenseDate: todayIst(), payeeName: '', description: '', billNo: '', supplierGstin: '', amount: '', gstRate: '', paidBy: 'cash', reference: '', itcEligible: true, branchId: '' });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const err = (k) => problem?.fields?.[k] && <span className="dash-field-error">{problem.fields[k]}</span>;
  const base = Math.round((Number(form.amount) || 0) * 100);
  const gst = Math.round((base * (Number(form.gstRate) || 0)) / 100);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const { id } = await api.inward.createExpense({ ...form, branchId: form.branchId || null });
      if (photo) {
        try {
          await api.inward.expensePhoto(id, await prepareImage(photo));
        } catch (e) {
          window.alert(`The expense is saved, but the photo didn't upload: ${e.message} You can add it from the list.`);
        }
      }
      onSaved();
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title="Add an expense" wide>
      <form onSubmit={save}>
        <div className="biz-form">
          <label className="dash-field">
            <span className="dash-field__label">What for</span>
            <select value={form.categoryId} onChange={set('categoryId')} required>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {err('categoryId')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Date</span>
            <input type="date" value={form.expenseDate} onChange={set('expenseDate')} />
            {err('expenseDate')}
          </label>
          <label className="dash-field biz-wide">
            <span className="dash-field__label">Description</span>
            <input value={form.description} onChange={set('description')} placeholder="For example: diesel for the delivery van, November rent" required />
            {err('description')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Paid to</span>
            <input value={form.payeeName} onChange={set('payeeName')} required />
            {err('payeeName')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Bill no. (optional)</span>
            <input value={form.billNo} onChange={set('billNo')} />
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Amount before GST (₹)</span>
            <input value={form.amount} onChange={set('amount')} inputMode="decimal" required />
            {err('amount')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">GST % (0 if none)</span>
            <input value={form.gstRate} onChange={set('gstRate')} inputMode="decimal" placeholder="0" />
            {err('gstRate')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Their GSTIN (optional)</span>
            <input value={form.supplierGstin} onChange={set('supplierGstin')} maxLength={15} />
            {err('supplierGstin')}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Paid by</span>
            <select value={form.paidBy} onChange={set('paidBy')}>
              {Object.entries(PAID_BY).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Reference (optional)</span>
            <input value={form.reference} onChange={set('reference')} placeholder="UTR / cheque no." />
          </label>
          {active.length > 1 && (
            <label className="dash-field">
              <span className="dash-field__label">Branch</span>
              <select value={form.branchId} onChange={set('branchId')}>
                <option value="">Main branch</option>
                {active.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="dash-field">
            <span className="dash-field__label">Photo of the bill (optional)</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
          </label>
          {form.supplierGstin && Number(form.gstRate) > 0 && (
            <label className="dash-check biz-wide">
              <input type="checkbox" checked={form.itcEligible} onChange={set('itcEligible')} /> GST on this bill can be claimed (input tax credit)
            </label>
          )}
        </div>
        {base > 0 && (
          <p className="dash-small">
            Total paid: <strong>{money(base + gst)}</strong> {gst > 0 && <span className="dash-muted">({money(base)} + GST {money(gst)})</span>}
          </p>
        )}
        {problem && <div className="dash-error">{problem.message}</div>}
        <button type="submit" className="dash-btn" disabled={busy} style={{ marginTop: 12 }}>
          {busy ? 'Saving…' : 'Save expense'}
        </button>
      </form>
    </Drawer>
  );
}

function Categories({ categories, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState(null);
  const save = async (id, body) => {
    setProblem(null);
    try {
      await api.inward.saveExpenseCategory(id, body);
      onChanged();
      return true;
    } catch (e) {
      setProblem(e);
      return false;
    }
  };
  return (
    <Drawer open onClose={onClose} title="Expense categories">
      <p className="dash-muted dash-small">The Tally ledger is the account each category goes to when expenses are sent to Tally.</p>
      <ul className="biz-list">
        {categories.map((c) => (
          <li key={c.id} className={c.active ? '' : 'is-off'}>
            <div>
              <strong>{c.name}</strong>
              <span className="dash-muted dash-block dash-small">Tally: {c.tally_ledger || 'same name'}</span>
            </div>
            <span className="dash-row">
              <button
                type="button"
                className="dash-link"
                onClick={() => {
                  const ledger = window.prompt(`Tally ledger for “${c.name}” (empty = same name):`, c.tally_ledger || '');
                  if (ledger !== null) save(c.id, { name: c.name, tallyLedger: ledger, active: c.active });
                }}
              >
                Tally ledger
              </button>
              <button type="button" className="dash-link" onClick={() => save(c.id, { name: c.name, tallyLedger: c.tally_ledger || '', active: !c.active })}>
                {c.active ? 'Hide' : 'Show'}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="dash-row"
        style={{ marginTop: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save(null, { name })) setName('');
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" aria-label="New category" />
        <button type="submit" className="dash-btn dash-btn--sm">
          Add
        </button>
      </form>
      {problem && <div className="dash-error">{problem.message}</div>}
    </Drawer>
  );
}
