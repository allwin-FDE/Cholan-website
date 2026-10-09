import AnimatedPrice from '../../components/checkout/AnimatedPrice';
import { formatPrice } from '../../lib/format';
import { hasProductImage } from '../../lib/products';

export default function OrderSummary({ items, count, subtotal, hasUnpriced, method, setQty }) {
  return (
    <aside className="co-summary">
      <div className="co-card co-card--summary">
        <h2>
          Order summary <span className="co-count">{count}</span>
        </h2>
        <ul className="co-items">
          {items.map((item) => (
            <li key={item.key} className="co-item">
              <span className="co-item__thumb" data-cat={item.product.category}>
                {hasProductImage(item.product) ? (
                  <img src={item.product.image} alt="" />
                ) : (
                  item.product.name.charAt(0)
                )}
                <span className="co-item__qty-badge">{item.qty}</span>
              </span>
              <span className="co-item__info">
                <strong>{item.product.name}</strong>
                <span>
                  {item.size ? `${item.size} · ` : ''}
                  {formatPrice(item.price)}
                </span>
                <span className="co-item__step">
                  <button
                    type="button"
                    onClick={() => setQty(item.id, item.size, item.qty - 1)}
                    aria-label={`One less ${item.product.name}`}
                  >
                    −
                  </button>
                  <span key={item.qty} className="atc__num">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(item.id, item.size, item.qty + 1)}
                    aria-label={`One more ${item.product.name}`}
                  >
                    +
                  </button>
                </span>
              </span>
              <span className="co-item__total">
                {item.total == null ? 'On request' : formatPrice(item.total)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="co-sums">
          <div>
            <dt>
              Subtotal ({count} {count === 1 ? 'item' : 'items'})
            </dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div>
            <dt>{method === 'pickup' ? 'Pickup' : 'Delivery'}</dt>
            <dd className="co-muted">{method === 'pickup' ? 'Free' : 'Confirmed on WhatsApp'}</dd>
          </div>
          <div className="co-sums__total">
            <dt>Total</dt>
            <dd>
              <AnimatedPrice value={subtotal} />
            </dd>
          </div>
        </dl>
        {hasUnpriced && (
          <p className="co-note">+ items priced on request — we'll add them when we confirm.</p>
        )}
        <button type="submit" className="co-place">
          Place order · <AnimatedPrice value={subtotal} />
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className="co-fine">
          Your order is sent to us on WhatsApp to confirm. No payment is taken online.
        </p>
      </div>
    </aside>
  );
}
