import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, Card, Drawer, ErrorNote, Loading, PageHead, useLoad } from '../../ui.jsx';
import { money, niceDate, todayIst } from './shared.js';
import { useUrl } from '../../urlState.js';
import NotConnected from './NotConnected.jsx';

// One price list per kind of customer. A new price starts on a date and the
// old one ends the day before, so past prices stay on record. Admin and
// Owner set prices; others can look.
export default function PriceLists() {
  const { allowed } = useDash();
  const canEdit = allowed('admin');
  const meta = useLoad(() => api.business.priceLists(), []);
  // The address holds the view: ?list=2&item=12 (the first list if none).
  const { id, patch } = useUrl();
  const listId = id('list') ?? meta.data?.lists?.[0]?.id ?? null;
  const setListId = (value) => patch({ list: value, item: '' });
  const detail = useLoad(() => (listId ? api.business.priceList(listId) : Promise.resolve(null)), [listId]);

  const items = useMemo(() => (meta.data?.items || []).filter((i) => i.kind === 'finished'), [meta.data]);
  const openItem = items.find((i) => i.id === id('item')) || null;
  const setOpenItem = (item) => patch({ item: item?.id });
  const byItem = useMemo(() => {
    const map = new Map();
    for (const p of detail.data?.prices || []) map.set(p.item_id, [...(map.get(p.item_id) || []), p]);
    return map;
  }, [detail.data]);

  if (meta.error?.code === 'no-database') return <NotConnected title="Price lists" />;
  const list = detail.data?.list;
  return (
    <div className="dash-page">
      <PageHead title="Price lists" intro="The price per bag for each kind of customer. A customer’s special prices are on their page under Customers." range={false} />
      {meta.error && <ErrorNote error={meta.error} onRetry={meta.reload} />}
      {meta.loading && !meta.data && <Loading />}
      {meta.data && (
        <Card>
          <div className="dash-filters">
            <div className="dash-seg biz-lists" role="group" aria-label="Price list">
              {meta.data.lists.map((l) => (
                <button key={l.id} type="button" className={listId === l.id ? 'is-on' : ''} onClick={() => setListId(l.id)}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          {list && (
            <p className="dash-muted dash-small">
              {list.includes_gst ? 'Prices include GST.' : 'Prices are before GST.'} {list.is_default && 'Used for the website and for anyone without their own list.'}{' '}
              {meta.data.lists.find((l) => l.id === list.id)?.customers > 0 && `${meta.data.lists.find((l) => l.id === list.id).customers} customers use this list.`}
            </p>
          )}
          {detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}
          {detail.loading && !detail.data && <Loading />}
          {detail.data && (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Pack</th>
                    <th className="dash-num">Price now</th>
                    <th>Bulk slabs</th>
                    <th>Coming up</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const prices = byItem.get(i.id) || [];
                    const now = prices.find((p) => p.state === 'current' && p.min_qty === 1);
                    const slabs = prices.filter((p) => p.state === 'current' && p.min_qty > 1);
                    const next = prices.filter((p) => p.state === 'upcoming');
                    return (
                      <tr key={i.id} className="dash-row-link" onClick={() => setOpenItem(i)}>
                        <td>
                          <strong>{i.product_name}</strong> <span className="dash-muted">{i.pack_label}</span>
                          {!i.active && <Badge tone="muted">Not sold</Badge>}
                        </td>
                        <td className="dash-num">{now ? money(now.price_paise) : <span className="dash-muted">Not set</span>}</td>
                        <td className="dash-small">{slabs.map((s) => `${s.min_qty}+ bags ${money(s.price_paise)}`).join(' · ')}</td>
                        <td className="dash-small">{next.map((n) => `${money(n.price_paise)} from ${niceDate(n.valid_from)}`).join(' · ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {openItem && list && (
        <ItemPrices
          item={openItem}
          list={list}
          prices={byItem.get(openItem.id) || []}
          canEdit={canEdit}
          onClose={() => setOpenItem(null)}
          onChanged={(data) => {
            detail.setData(data);
            meta.reload();
          }}
        />
      )}
    </div>
  );
}

const STATE = { current: ['Now', 'good'], upcoming: ['Starts later', 'info'], ended: ['Ended', 'muted'] };

function ItemPrices({ item, list, prices, canEdit, onClose, onChanged }) {
  const [form, setForm] = useState({ price: '', minQty: '1', validFrom: todayIst() });
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onChanged(await api.business.setListPrice(list.id, { itemId: item.id, ...form }));
      setForm({ price: '', minQty: '1', validFrom: todayIst() });
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  const end = async (price) => {
    const validTo = window.prompt('Last day this price applies (YYYY-MM-DD):', todayIst());
    if (!validTo) return;
    try {
      onChanged(await api.business.endListPrice(list.id, price.id, validTo));
    } catch (e) {
      window.alert(e.message);
    }
  };
  const err = (key) => problem?.fields?.[key] && <span className="dash-field-error">{problem.fields[key]}</span>;

  return (
    <Drawer open onClose={onClose} title={`${item.name} · ${list.name}`}>
      {prices.length ? (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th className="dash-num">Price</th>
                <th>Bags</th>
                <th>From</th>
                <th>Until</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id} className={p.state === 'ended' ? 'is-off' : ''}>
                  <td className="dash-num">{money(p.price_paise)}</td>
                  <td>{p.min_qty > 1 ? `${p.min_qty}+` : 'Any'}</td>
                  <td className="dash-nowrap">{niceDate(p.valid_from)}</td>
                  <td className="dash-nowrap">{p.valid_to ? niceDate(p.valid_to) : 'Until changed'}</td>
                  <td className="dash-nowrap">
                    <Badge tone={STATE[p.state][1]}>{STATE[p.state][0]}</Badge>
                    {canEdit && p.state !== 'ended' && !p.valid_to && (
                      <button type="button" className="dash-link" onClick={() => end(p)}>
                        End
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dash-muted">No price on this list yet.</p>
      )}
      {canEdit ? (
        <form className="biz-box" onSubmit={save}>
          <h3>Set a new price</h3>
          <p className="dash-muted dash-small">The current price for the same number of bags ends the day before the new one starts.</p>
          <div className="biz-form">
            <label className="dash-field">
              <span className="dash-field__label">Price per bag (₹)</span>
              <input value={form.price} onChange={set('price')} inputMode="decimal" required />
              {err('price')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Starts on</span>
              <input type="date" value={form.validFrom} onChange={set('validFrom')} required />
              {err('validFrom')}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">For orders of (bags or more)</span>
              <input value={form.minQty} onChange={set('minQty')} inputMode="numeric" />
              {err('minQty')}
            </label>
          </div>
          {problem && <div className="dash-error">{problem.message}</div>}
          <button type="submit" className="dash-btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save price'}
          </button>
        </form>
      ) : (
        <p className="dash-muted dash-small">Only Admin and Owner can change prices.</p>
      )}
    </Drawer>
  );
}
