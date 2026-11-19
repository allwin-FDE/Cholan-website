import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, useLoad } from '../../ui.jsx';
import { money, toRupeesInput } from './shared.js';
import NotConnected from './NotConnected.jsx';
import { useUrl, useUrlSearch } from '../../urlState.js';

// Every pack Cholan sells, with its SKU, HSN, GST rate and website price.
// Admin and Owner can correct the tax details, MRP, barcode and low-stock level.
export default function Products() {
  const { allowed } = useDash();
  const { data, loading, error, reload, setData } = useLoad(() => api.business.items(), []);
  // The address holds the view: ?q=…&item=12.
  const { id, patch } = useUrl();
  const [q, setQ] = useUrlSearch();
  const open = (data?.items || []).find((i) => i.id === id('item')) || null;
  const setOpen = (item) => patch({ item: item?.id });

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.items || []).filter((i) => !s || `${i.product_name} ${i.name} ${i.sku_code} ${i.hsn}`.toLowerCase().includes(s));
  }, [data, q]);
  const unconfirmed = (data?.items || []).filter((i) => i.active && !i.gst_confirmed).length;

  if (error?.code === 'no-database') return <NotConnected title="Products and packs" />;
  return (
    <div className="dash-page">
      <PageHead title="Products and packs" intro="Each pack size is its own item, with its own HSN, GST rate and price." range={false} />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          {unconfirmed > 0 && (
            <div className="dash-flash dash-flash--warn">
              {unconfirmed} {unconfirmed === 1 ? 'pack has a GST rate' : 'packs have GST rates'} not yet confirmed by your accountant. The first guess is 5% up to 25 kg and 0% for larger bags.
            </div>
          )}
          <Card>
            <div className="dash-filters">
              <label className="dash-search">
                <Icon name="search" />
                <input placeholder="Search product, pack, SKU, HSN…" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            </div>
            {items.length ? (
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Pack</th>
                      <th>SKU</th>
                      <th>HSN</th>
                      <th>GST</th>
                      <th className="dash-num">Website price</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="dash-row-link" onClick={() => setOpen(i)}>
                        <td>
                          <strong>{i.product_name || i.name}</strong>
                        </td>
                        <td className="dash-nowrap">{i.pack_label || '—'}</td>
                        <td className="dash-nowrap dash-muted">{i.sku_code}</td>
                        <td>{i.hsn}</td>
                        <td className="dash-nowrap">
                          {i.gst_rate_bp / 100}% {!i.gst_confirmed && <Badge tone="warn">to confirm</Badge>}
                        </td>
                        <td className="dash-num">{money(i.web_price_paise)}</td>
                        <td>{!i.active && <Badge tone="muted">Not sold</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon="box" title="No packs match" />
            )}
          </Card>
        </>
      )}
      {open && (
        <ItemDrawer
          item={open}
          canEdit={allowed('admin')}
          onClose={() => setOpen(null)}
          onSaved={(item) => {
            setData({ ...data, items: data.items.map((i) => (i.id === item.id ? item : i)) });
          }}
        />
      )}
    </div>
  );
}

function ItemDrawer({ item, canEdit, onClose, onSaved }) {
  const [form, setForm] = useState({
    hsn: item.hsn,
    gstPercent: String(item.gst_rate_bp / 100),
    gstConfirmed: item.gst_confirmed,
    mrp: toRupeesInput(item.mrp_paise),
    barcode: item.barcode || '',
    lowStockLevel: item.low_stock_level ?? '',
    active: item.active,
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const { item: saved } = await api.business.updateItem(item.id, form);
      onSaved(saved);
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={`${item.product_name || item.name} · ${item.pack_label || item.sku_code}`}>
      <dl className="dash-facts">
        <div>
          <dt>SKU</dt>
          <dd>{item.sku_code}</dd>
        </div>
        <div>
          <dt>Net weight</dt>
          <dd>{item.net_weight_g ? `${item.net_weight_g / 1000} kg` : '—'}</dd>
        </div>
        <div>
          <dt>Website price</dt>
          <dd>{money(item.web_price_paise)} (change it in Price lists)</dd>
        </div>
      </dl>
      {canEdit ? (
        <form className="biz-form" onSubmit={save}>
          <label className="dash-field">
            <span className="dash-field__label">HSN code</span>
            <input value={form.hsn} onChange={set('hsn')} inputMode="numeric" maxLength={8} />
            {problem?.fields?.hsn && <span className="dash-field-error">{problem.fields.hsn}</span>}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">GST %</span>
            <input value={form.gstPercent} onChange={set('gstPercent')} inputMode="decimal" />
            {problem?.fields?.gstPercent && <span className="dash-field-error">{problem.fields.gstPercent}</span>}
          </label>
          <label className="dash-check biz-wide">
            <input type="checkbox" checked={form.gstConfirmed} onChange={set('gstConfirmed')} />
            <span>GST rate checked by our accountant</span>
          </label>
          <label className="dash-field">
            <span className="dash-field__label">MRP on the pack (₹, optional)</span>
            <input value={form.mrp} onChange={set('mrp')} inputMode="decimal" />
            {problem?.fields?.mrp && <span className="dash-field-error">{problem.fields.mrp}</span>}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Barcode (optional)</span>
            <input value={form.barcode} onChange={set('barcode')} inputMode="numeric" maxLength={14} />
            {problem?.fields?.barcode && <span className="dash-field-error">{problem.fields.barcode}</span>}
          </label>
          <label className="dash-field">
            <span className="dash-field__label">Warn when stock falls below (bags)</span>
            <input value={form.lowStockLevel} onChange={set('lowStockLevel')} inputMode="numeric" />
          </label>
          <label className="dash-check biz-wide">
            <input type="checkbox" checked={form.active} onChange={set('active')} />
            <span>Still sold</span>
          </label>
          {problem && !problem.fields && <div className="dash-error biz-wide">{problem.message}</div>}
          <div className="biz-wide">
            <button type="submit" className="dash-btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <dl className="dash-facts">
          <div>
            <dt>HSN</dt>
            <dd>{item.hsn}</dd>
          </div>
          <div>
            <dt>GST</dt>
            <dd>
              {item.gst_rate_bp / 100}% {item.gst_confirmed ? '' : '(not yet confirmed)'}
            </dd>
          </div>
          <div>
            <dt>MRP</dt>
            <dd>{money(item.mrp_paise)}</dd>
          </div>
          <p className="dash-muted dash-small">Only Admin and Owner can change these.</p>
        </dl>
      )}
    </Drawer>
  );
}
