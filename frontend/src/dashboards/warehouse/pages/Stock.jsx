import { useState } from 'react';
import { api } from '../../shared/api.js';
import { useDash } from '../../shared/context.js';
import { Badge, Card, Drawer, ErrorNote, Loading, PageHead, ago, useLoad, when } from '../../shared/ui.jsx';
import NotConnected from './NotConnected.jsx';
import { useUrl } from '../../shared/urlState.js';

const KINDS = {
  opening: ['Opening count', 'Bags counted when the system starts.'],
  receive: ['Bags received', 'New bags into the godown (packed or bought).'],
  adjust: ['Correct the count', 'After counting: + bags found, − bags missing.'],
  damage: ['Bags found damaged', 'Moves good bags to damaged, out of what can be sold.'],
  write_off: ['Throw away damaged', 'Removes damaged bags for good.'],
};
const MOVE = {
  opening: 'Opening count',
  receive: 'Received',
  adjust: 'Count corrected',
  reserve: 'Reserved for order',
  release: 'Order cancelled',
  dispatch: 'Dispatched',
  return: 'Returned (good)',
  return_damaged: 'Returned (damaged)',
  damage: 'Found damaged',
  write_off: 'Thrown away',
};

// Bags in the godown for every pack: in hand, promised to confirmed orders,
// free to sell, and damaged. Every change is a movement that is never edited.
export default function Stock() {
  const { allowed } = useDash();
  const { data, loading, error, reload, setData } = useLoad(() => api.sales.stock(), []);
  // The address holds the open pack: ?item=12.
  const { id, patch } = useUrl();
  const setOpen = (row) => patch({ item: row?.item_id });

  if (error?.code === 'no-database') return <NotConnected title="Stock" />;
  const stock = data?.stock || [];
  const open = stock.find((s) => s.item_id === id('item')) || null;
  const low = stock.filter((s) => s.low).length;
  const empty = stock.length > 0 && stock.every((s) => s.on_hand === 0 && s.damaged === 0);
  return (
    <div className="dash-page">
      <PageHead title="Stock" intro="Bags in the godown, for each pack. Confirmed orders reserve bags; dispatch takes them out." range={false} />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {empty && (
        <div className="dash-flash dash-flash--warn">
          No stock entered yet. {allowed('admin') ? 'Open each pack and enter its opening count, so orders can be confirmed.' : 'An Admin or Owner needs to enter the opening count.'}
        </div>
      )}
      {low > 0 && <div className="dash-flash dash-flash--warn">{low} {low === 1 ? 'pack is' : 'packs are'} running low.</div>}
      {data && (
        <Card>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Pack</th>
                  <th className="dash-num">In hand</th>
                  <th className="dash-num">Reserved</th>
                  <th className="dash-num">Free to sell</th>
                  <th className="dash-num">Damaged</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.item_id} className="dash-row-link" onClick={() => setOpen(s)}>
                    <td>
                      <strong>{s.product_name || s.name}</strong> <span className="dash-muted">{s.pack_label}</span>
                    </td>
                    <td className="dash-num">{s.on_hand}</td>
                    <td className="dash-num">{s.reserved || ''}</td>
                    <td className="dash-num">
                      <strong>{s.available}</strong>
                    </td>
                    <td className="dash-num">{s.damaged || ''}</td>
                    <td>{s.low && <Badge tone="warn">Low</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {open && (
        <StockDrawer
          row={open}
          canChange={allowed('admin')}
          onClose={() => setOpen(null)}
          onChanged={(stockNow) => {
            setData({ stock: stockNow });
          }}
        />
      )}
    </div>
  );
}

function StockDrawer({ row, canChange, onClose, onChanged }) {
  const moves = useLoad(() => api.sales.stockMoves(row.item_id), [row.item_id, row.on_hand, row.reserved, row.damaged]);
  const [form, setForm] = useState({ kind: row.on_hand || row.damaged ? 'receive' : 'opening', qty: '', reason: '' });
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const { stock } = await api.sales.adjustStock({ itemId: row.item_id, ...form });
      onChanged(stock);
      setForm({ ...form, qty: '', reason: '' });
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open onClose={onClose} title={`${row.product_name || row.name} · ${row.pack_label || ''}`}>
      <dl className="dash-facts">
        <div>
          <dt>In hand</dt>
          <dd>{row.on_hand} bags</dd>
        </div>
        <div>
          <dt>Reserved for orders</dt>
          <dd>{row.reserved} bags</dd>
        </div>
        <div>
          <dt>Free to sell</dt>
          <dd>
            <strong>{row.available} bags</strong>
          </dd>
        </div>
        <div>
          <dt>Damaged</dt>
          <dd>{row.damaged} bags</dd>
        </div>
      </dl>
      {canChange ? (
        <form className="biz-box" onSubmit={save}>
          <h3>Change the stock</h3>
          <div className="biz-form">
            <label className="dash-field biz-wide">
              <span className="dash-field__label">What happened</span>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {Object.entries(KINDS).map(([k, [label]]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="dash-field__hint">{KINDS[form.kind][1]}</span>
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Bags{form.kind === 'adjust' ? ' (+ or −)' : ''}</span>
              <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} inputMode="numeric" required />
              {problem?.fields?.qty && <span className="dash-field-error">{problem.fields.qty}</span>}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Reason{form.kind === 'opening' ? ' (optional)' : ''}</span>
              <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={form.kind === 'receive' ? 'e.g. Packed batch 18 Nov' : ''} />
            </label>
          </div>
          {problem && <div className="dash-error">{problem.message}</div>}
          <button type="submit" className="dash-btn dash-btn--sm" disabled={busy} style={{ marginTop: 10 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : (
        <p className="dash-muted dash-small">Only Admin and Owner can change stock counts.</p>
      )}
      <section className="biz-section">
        <h3>Movements</h3>
        {moves.loading && !moves.data && <Loading />}
        {moves.data && !moves.data.moves.length && <p className="dash-muted">No movements yet.</p>}
        {moves.data?.moves?.length > 0 && (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th className="dash-num">Change</th>
                  <th className="dash-num">In hand after</th>
                </tr>
              </thead>
              <tbody>
                {moves.data.moves.map((m) => (
                  <tr key={m.id}>
                    <td className="dash-nowrap dash-small" title={when(m.at)}>
                      {ago(m.at)}
                    </td>
                    <td className="dash-small">
                      {MOVE[m.type] || m.type} {m.ref_number && <span className="dash-muted">· {m.ref_number}</span>}
                      {m.reason && <span className="dash-muted dash-block">{m.reason}</span>}
                      <span className="dash-muted dash-block">{m.actor}</span>
                    </td>
                    <td className="dash-num dash-small">
                      {[m.on_hand_change && `${m.on_hand_change > 0 ? '+' : ''}${m.on_hand_change} in hand`, m.reserved_change && `${m.reserved_change > 0 ? '+' : ''}${m.reserved_change} reserved`, m.damaged_change && `${m.damaged_change > 0 ? '+' : ''}${m.damaged_change} damaged`]
                        .filter(Boolean)
                        .join(', ')}
                    </td>
                    <td className="dash-num">{m.on_hand_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Drawer>
  );
}
