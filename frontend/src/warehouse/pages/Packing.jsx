import { useMemo } from 'react';
import { Card, Empty, ErrorNote, Loading } from '../../dashboard/ui.jsx';
import { PrintButton, WhHead, useLive, wh } from '../shared.jsx';
import { OrderCard } from './Orders.jsx';

// What to take off the shelves: all bags on orders still to be packed, added up.
export default function Packing() {
  const { data, error, reload } = useLive(() => wh.get('/orders'));
  const waiting = useMemo(() => (data?.orders || []).filter((o) => ['confirmed', 'packing'].includes(o.status)), [data]);
  const pick = useMemo(() => {
    const rows = new Map();
    for (const order of waiting) {
      for (const item of order.items) {
        const key = `${item.productId}|${item.pack}`;
        const row = rows.get(key) || { key, name: item.name, pack: item.pack, qty: 0, orders: [] };
        row.qty += item.qty;
        row.orders.push(order.number);
        rows.set(key, row);
      }
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name) || a.pack.localeCompare(b.pack));
  }, [waiting]);

  return (
    <div className="dash-page">
      <WhHead title="Packing" intro="Everything on confirmed orders, added up, so one trip to the shelves covers them all." actions={pick.length > 0 && <PrintButton label="Print pick list" />} />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !waiting.length && (
        <Empty icon="check" title="Nothing to pack">
          Confirmed orders appear here.
        </Empty>
      )}
      {waiting.length > 0 && (
        <>
          <Card title="Pick list">
            <div className="dash-table-wrap">
              <table className="dash-table wh-pick">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Bags</th>
                    <th>Orders</th>
                    <th className="wh-printonly">Done ✓</th>
                  </tr>
                </thead>
                <tbody>
                  {pick.map((row) => (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td>{row.pack}</td>
                      <td>
                        <strong>{row.qty}</strong>
                      </td>
                      <td>{row.orders.join(', ')}</td>
                      <td className="wh-printonly" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="wh-orders wh-gap wh-noprint">
            {waiting.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
