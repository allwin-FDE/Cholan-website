import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Drawer, ErrorNote, Icon, Loading, downloadCsv, num, when } from '../../dashboard/ui.jsx';
import { CATALOGUE, Field, PrintButton, WhHead, useLive, useWh, wh } from '../shared.jsx';

const MOVE_LABEL = {
  receive: 'Received',
  adjust: 'Count corrected',
  reserve: 'Reserved for order',
  release: 'Reservation released',
  dispatch: 'Dispatched',
  return: 'Returned',
  'return-damaged': 'Returned damaged',
};
const signed = (n) => (n > 0 ? `+${n}` : String(n));

export default function Stock() {
  const { seesMoney } = useWh();
  const [tab, setTab] = useState('stock');
  const [panel, setPanel] = useState(null); // { kind: receive | adjust | low, item }
  const stockState = useLive(() => wh.get('/stock'));
  const movesState = useLive(() => wh.get('/stock/moves'));
  const error = stockState.error || movesState.error;

  // Every size on sale, whether or not any has been counted yet.
  const rows = useMemo(() => {
    const saved = new Map((stockState.data?.stock || []).map((s) => [s.id, s]));
    const list = CATALOGUE.map((c) => ({ onHand: 0, reserved: 0, damaged: 0, low: 0, ...saved.get(c.key), id: c.key, productId: c.productId, name: c.name, pack: c.pack }));
    for (const s of saved.values()) if (!CATALOGUE.some((c) => c.key === s.id)) list.push({ onHand: 0, reserved: 0, damaged: 0, low: 0, ...s });
    return list;
  }, [stockState.data]);

  const done = () => {
    setPanel(null);
    stockState.reload();
    movesState.reload();
  };

  const exportCsv = () =>
    downloadCsv('cholan-stock.csv', [
      ['Product', 'Size', 'In hand', 'Reserved', 'Available', 'Damaged', 'Low level'],
      ...rows.map((r) => [r.name, r.pack, r.onHand, r.reserved, r.onHand - r.reserved, r.damaged, r.low]),
    ]);

  return (
    <div className="dash-page">
      <WhHead
        title="Stock"
        intro="In hand is what is on the shelves. Available is what is left after orders already confirmed."
        actions={
          <>
            <div className="dash-seg" role="group" aria-label="View">
              {[['stock', 'Stock'], ['moves', 'History']].map(([key, label]) => (
                <button key={key} type="button" className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv}>
              <Icon name="download" /> Export
            </button>
            <PrintButton label="Print count sheet" />
            <button type="button" className="dash-btn" onClick={() => setPanel({ kind: 'receive' })}>
              <Icon name="plus" /> Receive stock
            </button>
          </>
        }
      />
      {error && <ErrorNote error={error} onRetry={stockState.reload} />}
      {!stockState.data && !error && <Loading />}
      {stockState.data && tab === 'stock' && (
        <Card>
          <div className="dash-table-wrap">
            <table className="dash-table wh-stock">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Size</th>
                  <th>In hand</th>
                  <th className="wh-noprint">Reserved</th>
                  <th className="wh-noprint">Available</th>
                  <th className="wh-noprint">Damaged</th>
                  {seesMoney && <th className="wh-noprint">Low level</th>}
                  <th className="wh-printonly">Counted</th>
                  <th className="wh-noprint" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const available = row.onHand - row.reserved;
                  return (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.pack}</td>
                      <td>
                        <strong>{num(row.onHand)}</strong>
                      </td>
                      <td className="wh-noprint">{num(row.reserved)}</td>
                      <td className="wh-noprint">{available <= row.low ? <Badge tone={available <= 0 ? 'warn' : 'info'}>{num(available)}</Badge> : num(available)}</td>
                      <td className="wh-noprint">{num(row.damaged)}</td>
                      {seesMoney && (
                        <td className="wh-noprint">
                          <button type="button" className="dash-link" onClick={() => setPanel({ kind: 'low', item: row })} aria-label={`Low level for ${row.name} ${row.pack}`}>
                            {num(row.low)}
                          </button>
                        </td>
                      )}
                      <td className="wh-printonly" />
                      <td className="wh-noprint wh-stock__do">
                        <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setPanel({ kind: 'receive', item: row })}>
                          Receive
                        </button>
                        {seesMoney && (
                          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setPanel({ kind: 'adjust', item: row })}>
                            Correct
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'moves' && (
        <Card>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>What</th>
                  <th>Product</th>
                  <th>In hand change</th>
                  <th>In hand after</th>
                  <th>Who</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {(movesState.data?.moves || []).map((m) => (
                  <tr key={m.id}>
                    <td>{when(m.at)}</td>
                    <td>{MOVE_LABEL[m.type] || m.type}</td>
                    <td>
                      {m.name} {m.pack}
                    </td>
                    <td>{m.onHandChange ? signed(m.onHandChange) : m.reservedChange ? `${signed(m.reservedChange)} reserved` : m.damagedChange ? `${signed(m.damagedChange)} damaged` : '0'}</td>
                    <td>{num(m.onHandAfter)}</td>
                    <td>{m.by}</td>
                    <td>
                      {m.orderId && <Link to={`/warehouse/orders/${m.orderId}`}>{m.orderNumber}</Link>} {m.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movesState.data && !movesState.data.moves.length && <p className="dash-muted">No stock movements yet.</p>}
        </Card>
      )}
      {panel && <StockDrawer panel={panel} onClose={() => setPanel(null)} onDone={done} />}
    </div>
  );
}

const TITLES = { receive: 'Receive stock', adjust: 'Correct the count', low: 'Low stock level' };

function StockDrawer({ panel, onClose, onDone }) {
  const { kind, item } = panel;
  const [key, setKey] = useState(item?.id || '');
  const [value, setValue] = useState(kind === 'low' ? String(item.low) : '');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = item || CATALOGUE.find((c) => c.key === key);

  const submit = async (e) => {
    e.preventDefault();
    if (!chosen) return setProblem('Choose a product and size.');
    setBusy(true);
    setProblem('');
    const base = { productId: chosen.productId, name: chosen.name, pack: chosen.pack, reason };
    try {
      if (kind === 'receive') await wh.post('/stock/receive', { ...base, qty: Number(value) });
      if (kind === 'adjust') await wh.post('/stock/adjust', { ...base, counted: Number(value) });
      if (kind === 'low') await wh.patch('/stock/low', { ...base, low: Number(value) });
      onDone();
    } catch (error) {
      setProblem(error.message);
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Drawer open onClose={onClose} title={TITLES[kind]}>
      <form className="wh-drawer-form" onSubmit={submit}>
        {item ? (
          <p>
            <strong>
              {item.name} · {item.pack}
            </strong>
            <br />
            <span className="dash-muted">{num(item.onHand)} in hand now</span>
          </p>
        ) : (
          <Field label="Product and size">
            <select id="wh-stock-product" required value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Choose…</option>
              {CATALOGUE.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name} · {c.pack}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label={kind === 'receive' ? 'Bags received' : kind === 'adjust' ? 'Bags you counted' : 'Warn when available is at or below'}
          hint={kind === 'adjust' ? 'This replaces the figure above. Use it after a physical count.' : undefined}
        >
          <input id="wh-stock-qty" type="number" min="0" inputMode="numeric" required value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        {kind !== 'low' && (
          <Field label={kind === 'adjust' ? 'Reason' : 'Note (optional)'} hint={kind === 'receive' ? 'Supplier, lot or vehicle number.' : undefined}>
            <input id="wh-stock-reason" required={kind === 'adjust'} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        {problem && (
          <p className="dash-field-error" role="alert">
            {problem}
          </p>
        )}
        <button type="submit" className="dash-btn dash-btn--wide" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Drawer>
  );
}
