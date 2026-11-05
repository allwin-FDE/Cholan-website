import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Empty, ErrorNote, Icon, Loading, dateOnly, downloadCsv } from '../../dashboard/ui.jsx';
import { StepBadge, WhHead, rupees, useLive, useWh, wh } from '../shared.jsx';

export default function Customers() {
  const { seesMoney } = useWh();
  const { data, error, reload } = useLive(() => wh.get('/customers'));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.customers || [])
      .filter((c) => !needle || [c.name, c.phone, c.city].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
  }, [data, q]);

  const exportCsv = () =>
    downloadCsv('cholan-customers.csv', [
      ['Name', 'Phone', 'City', 'State', 'Orders', 'Last order', ...(seesMoney ? ['Total', 'Due'] : [])],
      ...list.map((c) => [c.name, c.phone, c.city, c.state, c.orderCount, dateOnly(c.lastOrderAt), ...(seesMoney ? [c.totalPaise / 100, c.duePaise / 100] : [])]),
    ]);

  return (
    <div className="dash-page">
      <WhHead
        title="Customers"
        intro="Everyone who has ordered, by phone number."
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
            <Icon name="download" /> Export
          </button>
        }
      />
      <div className="dash-filters wh-gap-below">
        <div className="dash-search">
          <Icon name="search" />
          <input aria-label="Search customers" placeholder="Name, phone or city" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !list.length && (
        <Empty icon="users" title="No customers yet">
          They appear here after their first order.
        </Empty>
      )}
      <div className="wh-orders">
        {list.map((c) => (
          <Card key={c.key} className="wh-customer">
            <button type="button" className="wh-customer__head" onClick={() => setOpen(open === c.key ? '' : c.key)} aria-expanded={open === c.key}>
              <span>
                <strong>{c.name}</strong>
                <small>
                  {c.phone}
                  {c.city && ` · ${c.city}`} · {c.orderCount} {c.orderCount === 1 ? 'order' : 'orders'}
                </small>
              </span>
              {seesMoney && c.duePaise > 0 && <strong className="wh-due">{rupees(c.duePaise)} due</strong>}
            </button>
            {open === c.key && (
              <ul className="wh-customer__orders">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <Link to={`/warehouse/orders/${o.id}`}>{o.number}</Link>
                    <span>{dateOnly(o.createdAt)}</span>
                    <StepBadge status={o.status} />
                    {seesMoney && <span>{rupees(o.totalPaise)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
