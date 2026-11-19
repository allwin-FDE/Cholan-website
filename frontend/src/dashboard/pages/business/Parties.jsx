import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, useLoad } from '../../ui.jsx';
import { CREDIT_STATUS, SEGMENTS, STATES, SUPPLIER_TYPES, money, niceDate, phoneShow, stateName, toRupeesInput, todayIst } from './shared.js';
import NotConnected from './NotConnected.jsx';
import { useUrl, useUrlSearch } from '../../urlState.js';

const TABS = { customer: 'Customers', supplier: 'Suppliers', all: 'All' };

// Everyone Cholan sells to or buys from. A mill that also buys rice is one
// record with both boxes ticked. Admin and Owner can add and change them,
// including price lists and credit limits; others can look.
export default function Parties() {
  const { allowed } = useDash();
  const canEdit = allowed('admin');
  // The address holds the view: ?type=supplier&q=…&party=12 (or &new=1).
  const { get, id, patch } = useUrl();
  const type = ['customer', 'supplier', 'all'].includes(get('type')) ? get('type') : 'customer';
  const setType = (key) => patch({ type: key === 'customer' ? '' : key });
  const [q, setQ, search] = useUrlSearch();
  const open = get('new') ? 'new' : id('party');
  const setOpen = (value) => patch({ new: value === 'new' ? 1 : '', party: value === 'new' ? '' : value });
  const { data, loading, error, reload } = useLoad(() => api.business.parties(type, search), [type, search]);
  const meta = useLoad(() => api.business.priceLists(), []);

  if (error?.code === 'no-database') return <NotConnected title="Customers and suppliers" />;
  return (
    <div className="dash-page">
      <PageHead
        title="Customers and suppliers"
        intro="Shops, hotels, distributors, institutions and households you sell to; mills and suppliers you buy from."
        range={false}
        actions={
          canEdit && (
            <button type="button" className="dash-btn" onClick={() => setOpen('new')}>
              <Icon name="plus" /> Add
            </button>
          )
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      <Card>
        <div className="dash-filters">
          <div className="dash-seg" role="group" aria-label="Show">
            {Object.entries(TABS).map(([key, label]) => (
              <button key={key} type="button" className={type === key ? 'is-on' : ''} onClick={() => setType(key)}>
                {label}
              </button>
            ))}
          </div>
          <label className="dash-search">
            <Icon name="search" />
            <input placeholder="Search name, mobile, GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {loading && !data && <Loading />}
        {data &&
          (data.parties.length ? (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Mobile</th>
                    <th>GSTIN</th>
                    <th>City</th>
                    {type !== 'supplier' && <th>Price list</th>}
                    {type !== 'supplier' && <th className="dash-num">Credit</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.parties.map((p) => (
                    <tr key={p.id} className="dash-row-link" onClick={() => setOpen(p.id)}>
                      <td>
                        <strong>{p.display_name}</strong>
                        {p.legal_name && p.legal_name !== p.display_name && <span className="dash-muted dash-block">{p.legal_name}</span>}
                      </td>
                      <td>
                        {p.is_customer && p.segment && <Badge tone="info">{SEGMENTS[p.segment]}</Badge>}
                        {p.is_supplier && p.supplier_type && <Badge>{SUPPLIER_TYPES[p.supplier_type]}</Badge>}
                      </td>
                      <td className="dash-nowrap">{phoneShow(p.phone)}</td>
                      <td className="dash-nowrap dash-muted">{p.gstin || '—'}</td>
                      <td>{p.city || ''}</td>
                      {type !== 'supplier' && <td>{p.price_list || ''}</td>}
                      {type !== 'supplier' && (
                        <td className="dash-num dash-nowrap">
                          {p.is_customer && (p.credit_limit_paise ? `${money(p.credit_limit_paise)} · ${p.terms_days} days` : 'No credit')}
                        </td>
                      )}
                      <td>
                        {!p.active && <Badge tone="muted">Inactive</Badge>}
                        {p.credit_status && p.credit_status !== 'active' && <Badge tone={CREDIT_STATUS[p.credit_status][1]}>{CREDIT_STATUS[p.credit_status][0]}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="users" title={search ? 'No one matches' : `No ${TABS[type].toLowerCase()} yet`}>
              {canEdit && !search ? 'Use “Add” to create the first one.' : null}
            </Empty>
          ))}
      </Card>
      {open && (
        <PartyDrawer
          id={open === 'new' ? null : open}
          startAs={type}
          canEdit={canEdit}
          lists={meta.data?.lists || []}
          items={meta.data?.items || []}
          onClose={() => setOpen(null)}
          onSaved={(party) => {
            patch({ new: '', party: party.id }, { replace: true });
            reload();
          }}
        />
      )}
    </div>
  );
}

const fromParty = (p) => ({
  kind: p.kind,
  displayName: p.display_name,
  legalName: p.legal_name || '',
  gstin: p.gstin || '',
  pan: p.pan || '',
  phone: p.phone ? p.phone.slice(3) : '',
  email: p.email || '',
  tallyLedgerName: p.tally_ledger_name || '',
  notes: p.notes || '',
  active: p.active,
  isCustomer: p.is_customer,
  isSupplier: p.is_supplier,
  customer: {
    segment: p.segment || 'retailer',
    priceList: p.price_list || '',
    creditLimit: toRupeesInput(p.credit_limit_paise ?? 0),
    termsDays: String(p.terms_days ?? 0),
    creditStatus: p.credit_status || 'active',
  },
  supplier: { supplierType: p.supplier_type || 'mill', termsDays: String(p.supplier_terms_days ?? 0) },
});

const blank = (startAs) => ({
  ...fromParty({ kind: 'business', display_name: '', active: true, is_customer: startAs !== 'supplier', is_supplier: startAs === 'supplier' }),
  address: { line1: '', line2: '', city: '', stateCode: '33', pincode: '' },
});

function PartyDrawer({ id, startAs, canEdit, lists, items, onClose, onSaved }) {
  const [party, setParty] = useState(null);
  const [form, setForm] = useState(id ? null : blank(startAs));
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.business
      .party(id)
      .then((p) => {
        setParty(p);
        setForm(fromParty(p));
      })
      .catch(setProblem);
  }, [id]);

  const set = (path) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const [a, b] = path.split('.');
    setForm((f) => (b ? { ...f, [a]: { ...f[a], [b]: value } } : { ...f, [a]: value }));
    setSaved(false);
  };
  const err = (key) => problem?.fields?.[key] && <span className="dash-field-error">{problem.fields[key]}</span>;

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const body = { ...form, customer: form.isCustomer ? form.customer : undefined, supplier: form.isSupplier ? form.supplier : undefined };
      // The address is optional when adding someone: sent only when started.
      if (id || !form.address.line1.trim()) delete body.address;
      const p = id ? await api.business.updateParty(id, body) : await api.business.createParty(body);
      setParty(p);
      setForm(fromParty(p));
      setSaved(true);
      onSaved(p);
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };

  const title = id ? party?.display_name || 'Loading…' : 'Add a customer or supplier';
  return (
    <Drawer open onClose={onClose} title={title} wide>
      {!form && !problem && <Loading />}
      {problem && !form && <ErrorNote error={problem} />}
      {form && (
        <form className="biz-form" onSubmit={save}>
          <fieldset className="biz-wide biz-fieldset" disabled={!canEdit}>
            <div className="dash-seg biz-wide" role="group" aria-label="Business or person">
              {[
                ['business', 'Business'],
                ['person', 'Person / household'],
              ].map(([k, label]) => (
                <button key={k} type="button" className={form.kind === k ? 'is-on' : ''} onClick={() => setForm({ ...form, kind: k })}>
                  {label}
                </button>
              ))}
            </div>
            <label className="dash-field">
              <span className="dash-field__label">Name *</span>
              <input value={form.displayName} onChange={set('displayName')} maxLength={120} required />
              {err('displayName')}
            </label>
            {form.kind === 'business' && (
              <label className="dash-field">
                <span className="dash-field__label">Legal name (as on GST)</span>
                <input value={form.legalName} onChange={set('legalName')} maxLength={160} />
              </label>
            )}
            <label className="dash-field">
              <span className="dash-field__label">Mobile</span>
              <input value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="10 digits" />
              {err('phone')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Email</span>
              <input type="email" value={form.email} onChange={set('email')} />
              {err('email')}
            </label>
            {form.kind === 'business' && (
              <>
                <label className="dash-field">
                  <span className="dash-field__label">GSTIN</span>
                  <input value={form.gstin} onChange={set('gstin')} maxLength={15} placeholder="33AAAAA0000A1Z5" />
                  {err('gstin')}
                </label>
                <label className="dash-field">
                  <span className="dash-field__label">PAN</span>
                  <input value={form.pan} onChange={set('pan')} maxLength={10} placeholder="Filled from the GSTIN" />
                  {err('pan')}
                </label>
              </>
            )}

            <div className="biz-wide biz-roles">
              <label className="dash-check">
                <input type="checkbox" checked={form.isCustomer} onChange={set('isCustomer')} />
                <span>Customer (we sell to them)</span>
              </label>
              <label className="dash-check">
                <input type="checkbox" checked={form.isSupplier} onChange={set('isSupplier')} />
                <span>Supplier (we buy from them)</span>
              </label>
              {err('isCustomer')}
            </div>

            {form.isCustomer && (
              <div className="biz-wide biz-box">
                <h3>As a customer</h3>
                <div className="biz-form">
                  <label className="dash-field">
                    <span className="dash-field__label">Type</span>
                    <select value={form.customer.segment} onChange={set('customer.segment')}>
                      {Object.entries(SEGMENTS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dash-field">
                    <span className="dash-field__label">Price list</span>
                    <select value={form.customer.priceList} onChange={set('customer.priceList')}>
                      <option value="">Usual for this type</option>
                      {lists.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                    {err('priceList')}
                  </label>
                  <label className="dash-field">
                    <span className="dash-field__label">Credit limit (₹, 0 = pays on order)</span>
                    <input value={form.customer.creditLimit} onChange={set('customer.creditLimit')} inputMode="decimal" />
                    {err('creditLimit')}
                  </label>
                  <label className="dash-field">
                    <span className="dash-field__label">Pay within (days)</span>
                    <input value={form.customer.termsDays} onChange={set('customer.termsDays')} inputMode="numeric" />
                    {err('termsDays')}
                  </label>
                  <label className="dash-field">
                    <span className="dash-field__label">Credit status</span>
                    <select value={form.customer.creditStatus} onChange={set('customer.creditStatus')}>
                      {Object.entries(CREDIT_STATUS).map(([k, [label]]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            {form.isSupplier && (
              <div className="biz-wide biz-box">
                <h3>As a supplier</h3>
                <div className="biz-form">
                  <label className="dash-field">
                    <span className="dash-field__label">Type</span>
                    <select value={form.supplier.supplierType} onChange={set('supplier.supplierType')}>
                      {Object.entries(SUPPLIER_TYPES).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dash-field">
                    <span className="dash-field__label">We pay within (days)</span>
                    <input value={form.supplier.termsDays} onChange={set('supplier.termsDays')} inputMode="numeric" />
                    {err('supplierTermsDays')}
                  </label>
                </div>
              </div>
            )}

            {!id && (
              <div className="biz-wide biz-box">
                <h3>Address (optional, can be added later)</h3>
                <AddressFields value={form.address} onChange={(address) => setForm({ ...form, address })} err={err} />
              </div>
            )}

            <label className="dash-field biz-wide">
              <span className="dash-field__label">Tally ledger name (for accounts)</span>
              <input value={form.tallyLedgerName} onChange={set('tallyLedgerName')} maxLength={120} />
              {err('tallyLedgerName')}
            </label>
            <label className="dash-field biz-wide">
              <span className="dash-field__label">Notes</span>
              <textarea className="dash-textarea" rows={2} value={form.notes} onChange={set('notes')} maxLength={1000} />
            </label>
            {id && (
              <label className="dash-check biz-wide">
                <input type="checkbox" checked={form.active} onChange={set('active')} />
                <span>Active (untick when you no longer deal with them)</span>
              </label>
            )}
          </fieldset>
          {problem && <div className="dash-error biz-wide">{problem.message}</div>}
          {canEdit ? (
            <div className="biz-wide dash-row">
              <button type="submit" className="dash-btn" disabled={busy}>
                {busy ? 'Saving…' : id ? 'Save changes' : 'Add'}
              </button>
              {saved && <span className="dash-muted">Saved.</span>}
            </div>
          ) : (
            <p className="dash-muted dash-small biz-wide">Only Admin and Owner can change customers and suppliers.</p>
          )}
        </form>
      )}

      {party && (
        <>
          <Addresses party={party} canEdit={canEdit} onChange={setParty} />
          <Contacts party={party} canEdit={canEdit} onChange={setParty} />
          {party.is_customer && <SpecialPrices party={party} items={items} canEdit={canEdit} onChange={setParty} />}
        </>
      )}
    </Drawer>
  );
}

function AddressFields({ value, onChange, err }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="biz-form">
      <label className="dash-field biz-wide">
        <span className="dash-field__label">Address</span>
        <input value={value.line1} onChange={set('line1')} maxLength={160} placeholder="Door no., street" />
        {err('line1')}
      </label>
      <label className="dash-field biz-wide">
        <span className="dash-field__label">Area / landmark</span>
        <input value={value.line2 || ''} onChange={set('line2')} maxLength={160} />
      </label>
      <label className="dash-field">
        <span className="dash-field__label">Town / city</span>
        <input value={value.city} onChange={set('city')} maxLength={60} />
        {err('city')}
      </label>
      <label className="dash-field">
        <span className="dash-field__label">Pincode</span>
        <input value={value.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} />
        {err('pincode')}
      </label>
      <label className="dash-field">
        <span className="dash-field__label">State</span>
        <select value={value.stateCode} onChange={set('stateCode')}>
          {STATES.map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
        </select>
        {err('stateCode')}
      </label>
      {'gstin' in value && (
        <label className="dash-field">
          <span className="dash-field__label">GSTIN at this address (optional)</span>
          <input value={value.gstin || ''} onChange={set('gstin')} maxLength={15} />
          {err('addressGstin')}
        </label>
      )}
    </div>
  );
}

// A small add/edit list under the party: addresses or contacts.
function useSubForm(party, onChange, save) {
  const [editing, setEditing] = useState(null); // { id|null, value }
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onChange(await save(editing));
      setEditing(null);
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  const err = (key) => problem?.fields?.[key] && <span className="dash-field-error">{problem.fields[key]}</span>;
  return { editing, setEditing: (v) => (setProblem(null), setEditing(v)), problem, busy, submit, err };
}

function Addresses({ party, canEdit, onChange }) {
  const f = useSubForm(party, onChange, ({ id, value }) => api.business.saveAddress(party.id, id, value));
  const edit = (a) =>
    f.setEditing({
      id: a?.id || null,
      value: a
        ? { kind: a.kind, label: a.label || '', line1: a.line1, line2: a.line2 || '', city: a.city, stateCode: a.state_code, pincode: a.pincode, gstin: a.gstin || '', isDefault: a.is_default, active: a.active }
        : { kind: 'both', label: '', line1: '', line2: '', city: '', stateCode: '33', pincode: '', gstin: '', isDefault: !party.addresses.length, active: true },
    });
  return (
    <section className="biz-section">
      <div className="biz-section__head">
        <h3>Addresses</h3>
        {canEdit && !f.editing && (
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => edit(null)}>
            <Icon name="plus" /> Add address
          </button>
        )}
      </div>
      {party.addresses.length === 0 && !f.editing && <p className="dash-muted">No address yet.</p>}
      <ul className="biz-list">
        {party.addresses.map((a) => (
          <li key={a.id} className={a.active ? '' : 'is-off'}>
            <div>
              <strong>{a.label || { billing: 'Billing', shipping: 'Delivery', both: 'Billing and delivery' }[a.kind]}</strong>
              {a.is_default && <Badge tone="good">Default</Badge>}
              {!a.active && <Badge tone="muted">Not used</Badge>}
              <span className="dash-block">
                {[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ')} · {stateName(a.state_code)}
                {a.gstin && ` · GSTIN ${a.gstin}`}
              </span>
            </div>
            {canEdit && (
              <button type="button" className="dash-link" onClick={() => edit(a)}>
                Edit
              </button>
            )}
          </li>
        ))}
      </ul>
      {f.editing && (
        <form className="biz-box" onSubmit={f.submit}>
          <div className="biz-form">
            <label className="dash-field">
              <span className="dash-field__label">Used for</span>
              <select value={f.editing.value.kind} onChange={(e) => f.setEditing({ ...f.editing, value: { ...f.editing.value, kind: e.target.value } })}>
                <option value="both">Billing and delivery</option>
                <option value="billing">Billing only</option>
                <option value="shipping">Delivery only</option>
              </select>
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Name for it (optional)</span>
              <input value={f.editing.value.label} placeholder="e.g. Godown, Branch 2" onChange={(e) => f.setEditing({ ...f.editing, value: { ...f.editing.value, label: e.target.value } })} />
            </label>
          </div>
          <AddressFields value={f.editing.value} onChange={(value) => f.setEditing({ ...f.editing, value })} err={f.err} />
          <div className="dash-row biz-checks">
            <label className="dash-check">
              <input type="checkbox" checked={f.editing.value.isDefault} onChange={(e) => f.setEditing({ ...f.editing, value: { ...f.editing.value, isDefault: e.target.checked } })} />
              <span>Default</span>
            </label>
            {f.editing.id && (
              <label className="dash-check">
                <input type="checkbox" checked={f.editing.value.active} onChange={(e) => f.setEditing({ ...f.editing, value: { ...f.editing.value, active: e.target.checked } })} />
                <span>Still used</span>
              </label>
            )}
          </div>
          {f.problem && <div className="dash-error">{f.problem.message}</div>}
          <div className="dash-row">
            <button type="submit" className="dash-btn dash-btn--sm" disabled={f.busy}>
              {f.busy ? 'Saving…' : 'Save address'}
            </button>
            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => f.setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Contacts({ party, canEdit, onChange }) {
  const f = useSubForm(party, onChange, ({ id, value }) => api.business.saveContact(party.id, id, value));
  const edit = (c) =>
    f.setEditing({
      id: c?.id || null,
      value: c
        ? { name: c.name, role: c.role || '', phone: c.phone ? c.phone.slice(3) : '', email: c.email || '', isPrimary: c.is_primary, active: c.active }
        : { name: '', role: '', phone: '', email: '', isPrimary: !party.contacts.length, active: true },
    });
  const set = (key) => (e) => f.setEditing({ ...f.editing, value: { ...f.editing.value, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });
  return (
    <section className="biz-section">
      <div className="biz-section__head">
        <h3>People to contact</h3>
        {canEdit && !f.editing && (
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => edit(null)}>
            <Icon name="plus" /> Add person
          </button>
        )}
      </div>
      {party.contacts.length === 0 && !f.editing && <p className="dash-muted">No one added yet.</p>}
      <ul className="biz-list">
        {party.contacts.map((c) => (
          <li key={c.id} className={c.active ? '' : 'is-off'}>
            <div>
              <strong>{c.name}</strong> {c.role && <span className="dash-muted">· {c.role}</span>}
              {c.is_primary && <Badge tone="good">Main contact</Badge>}
              <span className="dash-block">{[phoneShow(c.phone), c.email].filter(Boolean).join(' · ')}</span>
            </div>
            {canEdit && (
              <button type="button" className="dash-link" onClick={() => edit(c)}>
                Edit
              </button>
            )}
          </li>
        ))}
      </ul>
      {f.editing && (
        <form className="biz-box" onSubmit={f.submit}>
          <div className="biz-form">
            <label className="dash-field">
              <span className="dash-field__label">Name</span>
              <input value={f.editing.value.name} onChange={set('name')} maxLength={80} />
              {f.err('contactName')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Role</span>
              <input value={f.editing.value.role} onChange={set('role')} placeholder="e.g. Owner, Purchase manager" />
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Mobile</span>
              <input value={f.editing.value.phone} onChange={set('phone')} inputMode="tel" />
              {f.err('contactPhone')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Email</span>
              <input type="email" value={f.editing.value.email} onChange={set('email')} />
            </label>
          </div>
          <div className="dash-row biz-checks">
            <label className="dash-check">
              <input type="checkbox" checked={f.editing.value.isPrimary} onChange={set('isPrimary')} />
              <span>Main contact</span>
            </label>
            {f.editing.id && (
              <label className="dash-check">
                <input type="checkbox" checked={f.editing.value.active} onChange={set('active')} />
                <span>Still there</span>
              </label>
            )}
          </div>
          {f.problem && <div className="dash-error">{f.problem.message}</div>}
          <div className="dash-row">
            <button type="submit" className="dash-btn dash-btn--sm" disabled={f.busy}>
              {f.busy ? 'Saving…' : 'Save person'}
            </button>
            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => f.setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function SpecialPrices({ party, items, canEdit, onChange }) {
  const sellable = items.filter((i) => i.kind === 'finished' && i.active);
  const f = useSubForm(party, onChange, ({ value }) => api.business.setCustomerPrice(party.id, value));
  const [ending, setEnding] = useState(null);
  const set = (key) => (e) => f.setEditing({ ...f.editing, value: { ...f.editing.value, [key]: e.target.value } });
  const end = async (price) => {
    const validTo = window.prompt('Last day this special price applies (YYYY-MM-DD):', todayIst());
    if (!validTo) return;
    setEnding(price.id);
    try {
      onChange(await api.business.endCustomerPrice(party.id, price.id, validTo));
    } catch (e) {
      window.alert(e.message);
    } finally {
      setEnding(null);
    }
  };
  return (
    <section className="biz-section">
      <div className="biz-section__head">
        <h3>Special prices</h3>
        {canEdit && !f.editing && (
          <button
            type="button"
            className="dash-btn dash-btn--ghost dash-btn--sm"
            onClick={() => f.setEditing({ value: { itemId: sellable[0]?.id || '', price: '', minQty: '1', validFrom: todayIst(), note: '' } })}
          >
            <Icon name="plus" /> Add special price
          </button>
        )}
      </div>
      <p className="dash-muted dash-small">
        Agreed only with {party.display_name}. It replaces their {party.price_list || 'usual'} price for that pack while it applies.
      </p>
      {party.prices.length > 0 && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Pack</th>
                <th className="dash-num">Price</th>
                <th>From</th>
                <th>Until</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {party.prices.map((p) => (
                <tr key={p.id} className={p.state === 'ended' ? 'is-off' : ''}>
                  <td>
                    {p.item_name}
                    {p.min_qty > 1 && <span className="dash-muted"> · {p.min_qty}+ bags</span>}
                    {p.note && <span className="dash-muted dash-block">{p.note}</span>}
                  </td>
                  <td className="dash-num">{money(p.price_paise)}</td>
                  <td className="dash-nowrap">{niceDate(p.valid_from)}</td>
                  <td className="dash-nowrap">{p.valid_to ? niceDate(p.valid_to) : 'Until changed'}</td>
                  <td>
                    {p.state === 'upcoming' && <Badge tone="info">Starts later</Badge>}
                    {p.state === 'ended' && <Badge tone="muted">Ended</Badge>}
                    {canEdit && p.state !== 'ended' && !p.valid_to && (
                      <button type="button" className="dash-link" onClick={() => end(p)} disabled={ending === p.id}>
                        End
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {f.editing && (
        <form className="biz-box" onSubmit={f.submit}>
          <div className="biz-form">
            <label className="dash-field biz-wide">
              <span className="dash-field__label">Pack</span>
              <select value={f.editing.value.itemId} onChange={set('itemId')}>
                {sellable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · usual website price {money(i.web_price_paise)}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Price per bag (₹)</span>
              <input value={f.editing.value.price} onChange={set('price')} inputMode="decimal" required />
              {f.err('price')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">From how many bags</span>
              <input value={f.editing.value.minQty} onChange={set('minQty')} inputMode="numeric" />
              {f.err('minQty')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Starts on</span>
              <input type="date" value={f.editing.value.validFrom} onChange={set('validFrom')} required />
              {f.err('validFrom')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Note (optional)</span>
              <input value={f.editing.value.note} onChange={set('note')} maxLength={200} placeholder="e.g. Agreed by phone with the owner" />
            </label>
          </div>
          {f.problem && <div className="dash-error">{f.problem.message}</div>}
          <div className="dash-row">
            <button type="submit" className="dash-btn dash-btn--sm" disabled={f.busy}>
              {f.busy ? 'Saving…' : 'Save special price'}
            </button>
            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => f.setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
