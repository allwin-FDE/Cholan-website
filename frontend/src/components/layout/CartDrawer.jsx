import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { formatPrice } from '../../lib/format.js';
import { hasProductImage } from '../../lib/products.js';

// Slide-in cart drawer (original `Jd`). Only mounted when features.cart is on.
export default function CartDrawer() {
  const { items, count, subtotal, hasUnpriced, setQty, clear, open, setOpen } = useCart();
  const panelRef = useRef(null);
  const close = () => setOpen(false);

  // Focus the panel on open and close on Escape.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  return (
    <div className={`cart${open ? ' cart--open' : ''}`} inert={!open}>
      <div className="cart__backdrop" onClick={close} />
      <aside
        className="cart__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="cart__head">
          <h2>
            Your cart <span className="cart__head-count">{count}</span>
          </h2>
          <button type="button" className="cart__close" onClick={close} aria-label="Close cart">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {items.length === 0 ? (
          <div className="cart__empty">
            <span className="cart__empty-icon" aria-hidden="true">
              🌾
            </span>
            <p>Your cart is empty.</p>
            <Link to="/products" className="btn btn--primary" onClick={close}>
              Browse products
            </Link>
          </div>
        ) : (
          <>
            <ul className="cart__list">
              {items.map((item, index) => (
                <li key={item.key} className="cart__line" style={{ '--i': index }}>
                  <Link
                    to={`/products/${item.product.id}`}
                    className="cart__thumb"
                    data-cat={item.product.category}
                    onClick={close}
                  >
                    {hasProductImage(item.product) ? (
                      <img src={item.product.image} alt="" loading="lazy" />
                    ) : (
                      <span>{item.product.name.charAt(0)}</span>
                    )}
                  </Link>
                  <div className="cart__info">
                    <Link to={`/products/${item.product.id}`} className="cart__name" onClick={close}>
                      {item.product.name}
                    </Link>
                    <span className="cart__meta">
                      {item.size ? `${item.size} · ` : ''}
                      {formatPrice(item.price)}
                    </span>
                    <div className="cart__qty">
                      <button
                        type="button"
                        onClick={() => setQty(item.id, item.size, item.qty - 1)}
                        aria-label={`One less ${item.product.name}`}
                      >
                        −
                      </button>
                      <span className="atc__num" key={item.qty}>
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQty(item.id, item.size, item.qty + 1)}
                        aria-label={`One more ${item.product.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="cart__end">
                    <span className="cart__total">
                      {item.total == null ? 'On request' : formatPrice(item.total)}
                    </span>
                    <button
                      type="button"
                      className="cart__remove"
                      onClick={() => setQty(item.id, item.size, 0)}
                      aria-label={`Remove ${item.product.name}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <footer className="cart__foot">
              <div className="cart__sum">
                <span>Subtotal</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>
              {hasUnpriced && (
                <p className="cart__note">
                  Some items are priced on request — we'll confirm on WhatsApp.
                </p>
              )}
              <Link to="/checkout" className="cart__order" onClick={close}>
                Checkout · {formatPrice(subtotal)}
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <button type="button" className="cart__clear" onClick={clear}>
                Clear cart
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
