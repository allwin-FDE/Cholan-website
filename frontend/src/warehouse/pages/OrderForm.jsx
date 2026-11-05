import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card, ErrorNote, Icon, Loading } from '../../dashboard/ui.jsx';
import { CATALOGUE, Field, SOURCES, STATES, WhHead, rupees, stockKey, useWh, wh } from '../shared.jsx';

const EMPTY_CUSTOMER = { name: '', phone: '', address: '', city: '', state: 'Tamil Nadu', pincode: '', gstin: '' };
const blankLine = () => ({ key: '', qty: 1, unitRupees: '' });
const lastTen = (phone) => phone.replace(/\D/g, '').slice(-10);

// A new order, or changes to one that has not left yet.
export default function OrderForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { seesMoney } = useWh();
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [lines, setLines] = useState([blankLine()]);
  const [source, setSource] = useState('phone');
  const [notes, setNotes] = useState('');
  const [enquiryId, setEnquiryId] = useState('');
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [stock, setStock] = useState({});
  const [priceList, setPriceList] = useState({});
  const [people, setPeople] = useState([]);
  const [fields, setFields] = useState({});
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wh.get('/stock').then((d) => setStock(Object.fromEntries(d.stock.map((s) => [s.id, s]))));
    wh.get('/customers').then((d) => setPeople(d.customers));
    if (seesMoney) wh.get('/settings').then((d) => setPriceList(d.prices || {}));
    if (id) {
      wh.get(`/orders/${id}`)
        .then((o) => {
          setOrder(o);
          setCustomer({ ...EMPTY_CUSTOMER, ...o.customer });
          setSource(o.source);
          setNotes(o.notes || '');
          setLines(o.items.map((i) => ({ key: stockKey(i.productId, i.pack), qty: i.qty, unitRupees: seesMoney ? (i.unitPaise / 100 || '') : '' })));
        })
        .catch(setLoadError);
    } else if (params.get('enquiry')) {
      // Opened from an enquiry in the dashboard.
      setCustomer((c) => ({ ...c, name: params.get('name') || '', phone: params.get('phone') || '' }));
      setSource('enquiry');
      setEnquiryId(params.get('enquiry'));
      const product = params.get('product');
      const match = CATALOGUE.find((item) => item.productId === product);
      if (match) setLines([{ ...blankLine(), key: match.key }]);
      setNotes(params.get('message') || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const locked = order && order.status !== 'new';
  const setC = (key) => (e) => setCustomer({ ...customer, [key]: e.target.value });
  const setLine = (i, change) => setLines(lines.map((line, n) => (n === i ? { ...line, ...change } : line)));

  // A repeat customer: their details come back when the phone number matches.
  const known = useMemo(() => {
    if (id || lastTen(customer.phone).length < 10) return null;
    return people.find((p) => p.key === lastTen(customer.phone)) || null;
  }, [people, customer.phone, id]);

  const shortages = lines
    .filter((line) => line.key)
    .map((line) => {
      const item = stock[line.key];
      const available = (item?.onHand || 0) - (item?.reserved || 0);
      return Number(line.qty) > available ? `${CATALOGUE.find((c) => c.key === line.key)?.name} ${CATALOGUE.find((c) => c.key === line.key)?.pack}: ${Math.max(0, available)} available` : null;
    })
    .filter(Boolean);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setProblem('');
    setFields({});
    const items = lines
      .filter((line) => line.key)
      .map((line) => {
        const c = CATALOGUE.find((item) => item.key === line.key);
        return { productId: c.productId, name: c.name, pack: c.pack, qty: Number(line.qty), ...(seesMoney ? { unitRupees: line.unitRupees } : {}) };
      });
    try {
      const body = { customer, items, source, notes, enquiryId };
      const saved = id ? await wh.patch(`/orders/${id}`, body) : await wh.post('/orders', body);
      navigate(`/warehouse/orders/${saved.id}`, { replace: true });
    } catch (error) {
      setProblem(error.message);
      setFields(error.fields || {});
      setSaving(false);
    }
  };

  if (loadError) return <div className="dash-page"><ErrorNote error={loadError} /></div>;
  if (id && !order) return <div className="dash-page"><Loading /></div>;

  return (
    <form className="dash-page wh-form" onSubmit={submit}>
      <WhHead
        title={id ? `Edit ${order.number}` : 'New order'}
        actions={
          <Link to={id ? `/warehouse/orders/${id}` : '/warehouse/orders'} className="dash-link">
            <Icon name="back" /> Back
          </Link>
        }
      />
      <Card title="Customer">
        <div className="wh-fields">
          <Field label="Phone" error={fields.phone}>
            <input id="wh-phone" type="tel" inputMode="tel" autoComplete="off" value={customer.phone} onChange={setC('phone')} />
          </Field>
          <Field label="Name" error={fields.name}>
            <input id="wh-name" autoComplete="off" value={customer.name} onChange={setC('name')} />
          </Field>
          {known && (
            <div className="wh-known">
              <span>
                Repeat customer: <strong>{known.name}</strong>, {known.orderCount} {known.orderCount === 1 ? 'order' : 'orders'}.
              </span>
              <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setCustomer({ ...EMPTY_CUSTOMER, name: known.name, phone: customer.phone, address: known.address || '', city: known.city || '', state: known.state || 'Tamil Nadu', pincode: known.pincode || '', gstin: known.gstin || '' })}>
                Use their details
              </button>
            </div>
          )}
          <Field label="Delivery address" className="wh-span">
            <textarea id="wh-address" rows={2} value={customer.address} onChange={setC('address')} />
          </Field>
          <Field label="City or town">
            <input value={customer.city} onChange={setC('city')} />
          </Field>
          <Field label="State" hint="Used to work out the tax on the invoice.">
            <select value={customer.state} onChange={setC('state')}>
              {[...new Set([...STATES, customer.state])].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="PIN code">
            <input inputMode="numeric" value={customer.pincode} onChange={setC('pincode')} />
          </Field>
          <Field label="Customer GSTIN (optional)" error={fields.gstin}>
            <input value={customer.gstin} onChange={setC('gstin')} />
          </Field>
        </div>
      </Card>

      <Card title="Products" className="wh-gap" hint={locked ? 'Products cannot change after the order is confirmed. Cancel it and make a new one instead.' : undefined}>
        {lines.map((line, i) => {
          const listed = priceList[line.key];
          return (
            <div key={i} className="wh-line">
              <Field label="Product and size">
                <select aria-label={`Product ${i + 1}`} disabled={locked} value={line.key} onChange={(e) => setLine(i, { key: e.target.value })}>
                  <option value="">Choose…</option>
                  {CATALOGUE.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} · {c.pack}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bags">
                <input aria-label={`Bags ${i + 1}`} type="number" min="1" inputMode="numeric" disabled={locked} value={line.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
              </Field>
              {seesMoney && (
                <Field label="Price per bag (₹)" hint={listed !== undefined ? `Price list: ${rupees(listed)}` : 'Not on the price list'}>
                  <input aria-label={`Price ${i + 1}`} inputMode="decimal" value={line.unitRupees} onChange={(e) => setLine(i, { unitRupees: e.target.value })} placeholder={listed !== undefined ? String(listed / 100) : ''} />
                </Field>
              )}
              {!locked && lines.length > 1 && (
                <button type="button" className="dash-icon-btn wh-line__x" aria-label={`Remove product ${i + 1}`} onClick={() => setLines(lines.filter((_, n) => n !== i))}>
                  <Icon name="trash" />
                </button>
              )}
            </div>
          );
        })}
        {!locked && (
          <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setLines([...lines, blankLine()])}>
            <Icon name="plus" /> Add another product
          </button>
        )}
        {fields.items && <p className="dash-field-error">{fields.items}</p>}
        {!locked && shortages.length > 0 && (
          <p className="wh-warn" role="status">
            Not enough stock for now. {shortages.join('; ')}. You can still save the order, but it can't be dispatched until stock comes in.
          </p>
        )}
      </Card>

      <Card title="Details" className="wh-gap">
        <div className="wh-fields">
          {!id && (
            <Field label="How did this order come in?">
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                {Object.entries(SOURCES)
                  .filter(([key]) => key !== 'website')
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Notes for the warehouse" className="wh-span">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      {problem && (
        <div className="dash-flash dash-flash--bad wh-gap" role="alert">
          {problem}
        </div>
      )}
      <div className="wh-form__bar">
        <button type="submit" className="dash-btn dash-btn--wide wh-big" disabled={saving}>
          {saving ? 'Saving…' : id ? 'Save changes' : 'Save order'}
        </button>
      </div>
    </form>
  );
}
