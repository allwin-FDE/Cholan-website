import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, ErrorNote, Icon, Loading, dateOnly, downloadCsv } from '../../dashboard/ui.jsx';
import { FLOW, PAYMENT, PaidBadge, SOURCES, STEPS, StepBadge, WhHead, bags, rupees, useLive, useWh, wh } from '../shared.jsx';

const matches = (order, q) =>
  [order.number, order.customer.name, order.customer.phone, order.customer.city, order.invoiceNumber, ...order.items.map((i) => i.name)].join(' ').toLowerCase().includes(q);

export function OrderCard({ order }) {
  const { seesMoney } = useWh();
  return (
    <Link to={`/warehouse/orders/${order.id}`} className="wh-order">
      <div className="wh-order__top">
        <strong>{order.number}</strong>
        <StepBadge status={order.status} />
        {seesMoney && <PaidBadge status={order.paymentStatus} />}
      </div>
      <div className="wh-order__who">
        {order.customer.name} · {order.customer.phone}
      </div>
      <div className="wh-order__items">{order.items.map((i) => `${i.qty} × ${i.name} ${i.pack}`).join(', ')}</div>
      <div className="wh-order__foot">
        <span>{dateOnly(order.createdAt)}</span>
        <span>{SOURCES[order.source]}</span>
        {seesMoney && <strong>{rupees(order.totalPaise)}</strong>}
      </div>
    </Link>
  );
}

export default function Orders() {
  const { seesMoney } = useWh();
  const [params, setParams] = useSearchParams();
  const step = params.get('step') || '';
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [payment, setPayment] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState('list');
  const { data, error, reload } = useLive(() => wh.get('/orders'));

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.orders || []).filter(
      (order) =>
        (!step || order.status === step || view === 'board') &&
        (!source || order.source === source) &&
        (!payment || order.paymentStatus === payment) &&
        (!from || order.createdAt.slice(0, 10) >= from) &&
        (!to || order.createdAt.slice(0, 10) <= to) &&
        (!needle || matches(order, needle)),
    );
  }, [data, step, source, payment, from, to, q, view]);

  const exportCsv = () =>
    downloadCsv('cholan-orders.csv', [
      ['Order', 'Date', 'Step', 'Source', 'Customer', 'Phone', 'City', 'State', 'Products', 'Bags', ...(seesMoney ? ['Total', 'Paid', 'Payment', 'Invoice'] : [])],
      ...list.map((o) => [
        o.number,
        dateOnly(o.createdAt),
        STEPS[o.status]?.label,
        SOURCES[o.source],
        o.customer.name,
        o.customer.phone,
        o.customer.city,
        o.customer.state,
        o.items.map((i) => `${i.qty} x ${i.name} ${i.pack}`).join('; '),
        bags(o.items),
        ...(seesMoney ? [(o.totalPaise || 0) / 100, (o.paidPaise || 0) / 100, PAYMENT[o.paymentStatus]?.label, o.invoiceNumber || ''] : []),
      ]),
    ]);

  return (
    <div className="dash-page">
      <WhHead
        title="Orders"
        actions={
          <>
            <div className="dash-seg" role="group" aria-label="View">
              {[['list', 'List'], ['board', 'Board']].map(([key, label]) => (
                <button key={key} type="button" className={view === key ? 'is-on' : ''} onClick={() => setView(key)}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
              <Icon name="download" /> Export
            </button>
            <Link to="/warehouse/orders/new" className="dash-btn">
              <Icon name="plus" /> New order
            </Link>
          </>
        }
      />
      <div className="dash-filters wh-gap-below">
        <div className="dash-search">
          <Icon name="search" />
          <input aria-label="Search orders" placeholder="Order number, name, phone or product" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === 'list' && (
          <select aria-label="Step" value={step} onChange={(e) => setParams(e.target.value ? { step: e.target.value } : {})}>
            <option value="">All steps</option>
            {Object.entries(STEPS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {Object.entries(SOURCES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        {seesMoney && (
          <select aria-label="Payment" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="">All payments</option>
            {Object.entries(PAYMENT).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        <input type="date" aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !list.length && (
        <Empty icon="inbox" title={data.orders.length ? 'No orders match' : 'No orders yet'}>
          {data.orders.length ? 'Try clearing the search or filters.' : 'Press New order to add the first one.'}
        </Empty>
      )}
      {data && list.length > 0 && view === 'list' && (
        <div className="wh-orders">
          {list.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
      {data && list.length > 0 && view === 'board' && (
        <div className="wh-board">
          {FLOW.map((key) => {
            const column = list.filter((order) => order.status === key);
            return (
              <section key={key} className="wh-board__col" aria-label={STEPS[key].label}>
                <h2>
                  {STEPS[key].label} <span>{column.length}</span>
                </h2>
                {column.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
