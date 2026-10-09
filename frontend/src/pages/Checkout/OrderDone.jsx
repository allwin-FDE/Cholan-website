import { Link } from 'react-router-dom';
import { formatPrice } from '../../lib/format';

// Confirmation screen shown after the WhatsApp order is sent.
export default function OrderDone({ order }) {
  return (
    <section className="section co">
      <div className="container co-done">
        <div className="co-done__tick" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27l7 7 15-16" />
          </svg>
        </div>
        <h1>Thank you, {order.name.split(' ')[0]}!</h1>
        <p className="lede">
          Your order of {order.count} {order.count === 1 ? 'item' : 'items'} has been sent to us on
          WhatsApp. We'll confirm availability and {order.method === 'pickup' ? 'your pickup time' : 'delivery'}{' '}
          shortly.
        </p>
        <div className="co-done__total">
          <span>Order total</span>
          <strong>{formatPrice(order.total)}</strong>
          {order.hasUnpriced && <small>+ items priced on request</small>}
        </div>
        <div className="co-done__actions">
          <a href={order.url} target="_blank" rel="noreferrer" className="btn btn--primary">
            WhatsApp didn't open? Send again
          </a>
          <Link to="/products" className="btn btn--ghost">
            Continue shopping
          </Link>
        </div>
      </div>
    </section>
  );
}
