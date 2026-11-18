import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useDash } from '../../context.js';
import { Badge, Card, Empty, ErrorNote, Icon, Loading, PageHead, useLoad } from '../../ui.jsx';
import { money, niceDate } from './shared.js';
import { printUrl } from './Orders.jsx';
import NotConnected from './NotConnected.jsx';

const TYPES = { tax_invoice: 'Tax invoice', bill_of_supply: 'Bill of supply', invoice_cum_bos: 'Tax invoice cum bill of supply' };
const SERIES = { invoice: 'GST invoices', credit_note: 'Credit notes', receipt: 'Payment receipts', order: 'Orders' };

// Every GST invoice, with what is still unpaid. Invoices are made from orders
// and never edited; numbering can be set to carry on from the paper bill book.
export default function Invoices() {
  const { allowed } = useDash();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error, reload } = useLoad(() => api.sales.invoices(search), [search]);

  if (error?.code === 'no-database') return <NotConnected title="Invoices" />;
  return (
    <div className="dash-page">
      <PageHead title="Invoices" intro="GST invoices made from orders. Open one to print it or save it as PDF." range={false} />
      {error && <ErrorNote error={error} onRetry={reload} />}
      <Card>
        <div className="dash-filters">
          <label className="dash-search">
            <Icon name="search" />
            <input placeholder="Invoice, order or customer…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {loading && !data && <Loading />}
        {data &&
          (data.invoices.length ? (
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th className="dash-num">Total</th>
                    <th className="dash-num">Unpaid</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((i) => (
                    <tr key={i.id} className={i.status === 'cancelled' ? 'is-off' : ''}>
                      <td className="dash-nowrap">
                        <strong>{i.number}</strong>
                        <span className="dash-muted dash-block dash-small">{i.order_number}</span>
                      </td>
                      <td className="dash-nowrap">{niceDate(i.invoice_date)}</td>
                      <td>{i.customer}</td>
                      <td className="dash-small">
                        {TYPES[i.doc_type]} · {i.supply_type}
                      </td>
                      <td className="dash-num">{money(i.total_paise)}</td>
                      <td className="dash-num">
                        {i.status === 'cancelled' ? (
                          <Badge tone="muted">Cancelled</Badge>
                        ) : i.balance_paise > 0 ? (
                          <>
                            {money(i.balance_paise)} {i.days_overdue > 0 && <Badge tone="bad">{i.days_overdue} days late</Badge>}
                          </>
                        ) : (
                          <Badge tone="good">Paid</Badge>
                        )}
                      </td>
                      <td>
                        <a className="dash-link" href={printUrl('invoice', i.id)} target="_blank" rel="noreferrer">
                          Print
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="file" title={search ? 'No invoices match' : 'No invoices yet'}>
              Invoices are made from Orders: confirm an order, then “Make invoice now” or dispatch it.
            </Empty>
          ))}
      </Card>
      <Numbering canChange={allowed('admin')} />
    </div>
  );
}

function Numbering({ canChange }) {
  const { data, error, reload, setData } = useLoad(() => api.sales.series(), []);
  const [editing, setEditing] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      setData(await api.sales.setSeries(editing));
      setEditing(null);
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Numbering" hint="The next number for each kind of document this financial year. To carry on from your bill book, set the next invoice number before the first invoice. Once used, a number can only go up.">
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Documents</th>
                <th>Year</th>
                <th>Next number</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.series.map((s) => (
                <tr key={`${s.doc_type}${s.scope}${s.fy}`}>
                  <td>
                    {SERIES[s.doc_type]} {s.scope !== 'all' && <span className="dash-muted dash-small">· GSTIN {s.scope}</span>}
                  </td>
                  <td>{s.fy === 'all' ? 'All years' : `20${s.fy.replace('-', '–20')}`}</td>
                  <td>
                    <strong>{s.prefix + String(s.next_no).padStart(s.pad, '0')}</strong>
                  </td>
                  <td>
                    {canChange && (
                      <button
                        type="button"
                        className="dash-link"
                        onClick={() => {
                          setProblem(null);
                          setEditing({ docType: s.doc_type, scope: s.scope, fy: s.fy, prefix: s.prefix, nextNo: String(s.next_no), pad: s.pad });
                        }}
                      >
                        Change
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <form className="biz-box" onSubmit={save}>
          <h3>{SERIES[editing.docType]}</h3>
          <div className="biz-form">
            <label className="dash-field">
              <span className="dash-field__label">Prefix</span>
              <input value={editing.prefix} onChange={(e) => setEditing({ ...editing, prefix: e.target.value })} maxLength={10} />
              {problem?.fields?.prefix && <span className="dash-field-error">{problem.fields.prefix}</span>}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Next number</span>
              <input value={editing.nextNo} onChange={(e) => setEditing({ ...editing, nextNo: e.target.value })} inputMode="numeric" />
              {problem?.fields?.nextNo && <span className="dash-field-error">{problem.fields.nextNo}</span>}
            </label>
            <label className="dash-field">
              <span className="dash-field__label">Digits</span>
              <select value={editing.pad} onChange={(e) => setEditing({ ...editing, pad: Number(e.target.value) })}>
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} (e.g. {'1'.padStart(n, '0')})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="dash-small">
            The next one will be <strong>{editing.prefix + String(editing.nextNo || 1).padStart(editing.pad, '0')}</strong>.
          </p>
          {problem && <div className="dash-error">{problem.message}</div>}
          <div className="dash-row">
            <button type="submit" className="dash-btn dash-btn--sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}
