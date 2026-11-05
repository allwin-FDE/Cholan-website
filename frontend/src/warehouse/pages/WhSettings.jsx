import { useEffect, useState } from 'react';
import { Card, ErrorNote, Loading } from '../../dashboard/ui.jsx';
import { products } from '../../data/products.js';
import { CATALOGUE, Field, WhHead, wh } from '../shared.jsx';

const SELLER = [
  ['legalName', 'Company name on the invoice'],
  ['addressLine1', 'Address, line 1'],
  ['addressLine2', 'Address, line 2'],
  ['state', 'State'],
  ['stateCode', 'State code'],
  ['gstin', 'GSTIN'],
  ['fssai', 'FSSAI licence'],
  ['phone', 'Phone'],
  ['email', 'Email'],
];

// Prices are typed in rupees and kept in paise. Saved together with one button.
export default function WhSettings() {
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    wh.get('/settings')
      .then((s) => {
        setForm({
          ...s,
          priceText: Object.fromEntries(CATALOGUE.map((c) => [c.key, s.prices[c.key] !== undefined ? String(s.prices[c.key] / 100) : ''])),
          gstText: Object.fromEntries(products.map((p) => [p.id, s.gst[p.id] !== undefined ? String(s.gst[p.id]) : ''])),
          hsnText: Object.fromEntries(products.map((p) => [p.id, s.hsn[p.id] || ''])),
        });
      })
      .catch(setLoadError);
  }, []);

  if (loadError) return <div className="dash-page"><ErrorNote error={loadError} /></div>;
  if (!form) return <div className="dash-page"><Loading /></div>;

  const setMap = (name, key) => (e) => setForm({ ...form, [name]: { ...form[name], [key]: e.target.value } });
  const setSeller = (key) => (e) => setForm({ ...form, seller: { ...form.seller, [key]: e.target.value } });

  const save = async (event) => {
    event.preventDefault();
    const prices = {};
    for (const [key, text] of Object.entries(form.priceText)) {
      if (text.trim() === '') continue;
      const n = Number(text.replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0) return setMessage({ tone: 'bad', text: `Check the price: ${text}` });
      prices[key] = Math.round(n * 100);
    }
    const gst = {};
    for (const [key, text] of Object.entries(form.gstText)) {
      if (text.trim() === '') continue;
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0 || n > 40) return setMessage({ tone: 'bad', text: `Check the GST rate: ${text}` });
      gst[key] = n;
    }
    const hsn = {};
    for (const [key, text] of Object.entries(form.hsnText)) if (text.trim()) hsn[key] = text.trim();
    setBusy(true);
    setMessage(null);
    try {
      await wh.put('/settings', { pricesIncludeGst: form.pricesIncludeGst, defaultHsn: form.defaultHsn, prices, gst, hsn, seller: form.seller });
      setMessage({ tone: 'good', text: 'Saved. New orders use these prices; existing orders and invoices keep theirs.' });
    } catch (error) {
      setMessage({ tone: 'bad', text: error.message });
    }
    setBusy(false);
    return undefined;
  };

  return (
    <form className="dash-page wh-form" onSubmit={save}>
      <WhHead title="Settings" intro="Only managers and admins see this page." />
      <div className="wh-warn" role="note">
        Please ask your accountant to confirm the GST rates, HSN codes and invoice details before issuing real invoices.
      </div>
      <Card title="Prices per bag (₹)" className="wh-gap" hint="Private to managers. The website does not show them.">
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Size</th>
                <th>Price (₹)</th>
              </tr>
            </thead>
            <tbody>
              {CATALOGUE.map((c) => (
                <tr key={c.key}>
                  <td>{c.name}</td>
                  <td>{c.pack}</td>
                  <td>
                    <input className="wh-num" aria-label={`Price of ${c.name} ${c.pack}`} inputMode="decimal" value={form.priceText[c.key]} onChange={setMap('priceText', c.key)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="GST" className="wh-gap" hint="An invoice can't be made for a product until its rate is set here. Enter 0 for no tax.">
        <label className="wh-check">
          <input type="checkbox" checked={form.pricesIncludeGst} onChange={(e) => setForm({ ...form, pricesIncludeGst: e.target.checked })} />
          The prices above already include GST
        </label>
        <Field label="Default HSN code" className="wh-short">
          <input value={form.defaultHsn} inputMode="numeric" onChange={(e) => setForm({ ...form, defaultHsn: e.target.value })} />
        </Field>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>GST rate (%)</th>
                <th>HSN, if different</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <input className="wh-num" aria-label={`GST rate of ${p.name}`} inputMode="decimal" value={form.gstText[p.id]} onChange={setMap('gstText', p.id)} />
                  </td>
                  <td>
                    <input className="wh-num" aria-label={`HSN of ${p.name}`} inputMode="numeric" value={form.hsnText[p.id]} onChange={setMap('hsnText', p.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="On the invoice" className="wh-gap" hint="Invoices already issued keep the details they were issued with.">
        <div className="wh-fields">
          {SELLER.map(([key, label]) => (
            <Field key={key} label={label}>
              <input value={form.seller[key] || ''} onChange={setSeller(key)} />
            </Field>
          ))}
          <Field label="Bank details" className="wh-span">
            <textarea rows={3} value={form.seller.bankDetails || ''} onChange={setSeller('bankDetails')} />
          </Field>
          <Field label="Terms" className="wh-span">
            <textarea rows={3} value={form.seller.terms || ''} onChange={setSeller('terms')} />
          </Field>
        </div>
      </Card>
      {message && (
        <div className={`dash-flash dash-flash--${message.tone} wh-gap`} role="status">
          {message.text}
        </div>
      )}
      <div className="wh-form__bar">
        <button type="submit" className="dash-btn dash-btn--wide wh-big" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
