import { Link, useParams } from 'react-router-dom';
import { ErrorNote, Icon, Loading, dateOnly, useLoad } from '../../dashboard/ui.jsx';
import { site } from '../../config/site.js';
import { PrintButton, WhHead, bags, wh } from '../shared.jsx';

// The packing slip and the address label. No prices: they travel with the bags.
export default function PackingSlip() {
  const { id } = useParams();
  const { data: order, error, reload } = useLoad(() => wh.get(`/orders/${id}`), [id]);
  if (error) return <div className="dash-page"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!order) return <div className="dash-page"><Loading /></div>;
  const { customer } = order;
  return (
    <div className="dash-page">
      <div className="wh-noprint">
        <WhHead
          title="Packing slip"
          actions={
            <>
              <Link to={`/warehouse/orders/${id}`} className="dash-link">
                <Icon name="back" /> Back
              </Link>
              <PrintButton />
            </>
          }
        />
      </div>
      <article className="wh-sheet">
        <header className="wh-sheet__head">
          <div>
            <h2>Packing slip</h2>
            <p>{site.name}</p>
          </div>
          <div className="wh-sheet__ref">
            <strong>{order.number}</strong>
            <span>{dateOnly(order.createdAt)}</span>
          </div>
        </header>
        <table className="wh-sheet__table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Size</th>
              <th>Bags</th>
              <th>Packed ✓</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={`${item.productId}-${item.pack}`}>
                <td>{item.name}</td>
                <td>{item.pack}</td>
                <td>{item.qty}</td>
                <td />
              </tr>
            ))}
            <tr className="wh-sheet__sum">
              <td colSpan={2}>Total bags</td>
              <td>{bags(order.items)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        {order.notes && (
          <p>
            <strong>Notes:</strong> {order.notes}
          </p>
        )}
        <p className="wh-sheet__sign">Packed by: ____________________ &nbsp; Checked by: ____________________</p>
        <section className="wh-label" aria-label="Address label">
          <p className="wh-label__to">Deliver to</p>
          <p className="wh-label__name">{customer.name}</p>
          <p>{customer.phone}</p>
          {customer.address && <p>{customer.address}</p>}
          <p>{[customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')}</p>
          <p className="wh-label__from">
            {order.number} · From {site.name}, {site.phone}
          </p>
        </section>
      </article>
    </div>
  );
}
