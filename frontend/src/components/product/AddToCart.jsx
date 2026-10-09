import { useRef } from 'react';
import { useCart } from '../../context/CartContext';
import { getDefaultPack } from '../../lib/packs';
import { flyToCart, floatPlusOne } from './flyToCart';

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

// Add button that turns into a quantity stepper once the pack is in the cart (original `yf`).
export default function AddToCart({ product, pack = getDefaultPack(product), className = '' }) {
  const cart = useCart();
  const ref = useRef(null);
  const qty = cart.qtyOf(product.id, pack.size);

  const add = (event) => {
    const source = ref.current
      ?.closest('.card, .pdp')
      ?.querySelector('.card__media img, .card__initial, .pdp__photo');
    flyToCart(source);
    floatPlusOne(event.currentTarget);
    cart.add(product.id, pack.size);
  };

  return (
    <div ref={ref} className={`atc${qty > 0 ? ' atc--in' : ''} ${className}`}>
      <button
        type="button"
        className="atc__add"
        onClick={add}
        tabIndex={qty > 0 ? -1 : 0}
        aria-hidden={qty > 0 || undefined}
      >
        <Svg>
          <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.7a1.5 1.5 0 0 0 1.4-1.1L21 8H6.2" />
          <circle cx="9.5" cy="20" r="1.3" />
          <circle cx="17" cy="20" r="1.3" />
        </Svg>
        Add to cart
      </button>
      <div className="atc__stepper" aria-hidden={qty === 0 || undefined}>
        <button
          type="button"
          className="atc__step"
          onClick={() => cart.setQty(product.id, pack.size, qty - 1)}
          aria-label={qty === 1 ? `Remove ${product.name} from cart` : `One less ${product.name}`}
          tabIndex={qty > 0 ? 0 : -1}
        >
          {qty === 1 ? (
            <Svg>
              <path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 19l1-12M9 7V4.5h6V7" />
            </Svg>
          ) : (
            <Svg>
              <path d="M6 12h12" />
            </Svg>
          )}
        </button>
        <span className="atc__qty" aria-live="polite">
          <span key={qty} className="atc__num">
            {qty}
          </span>
          <span className="visually-hidden"> in cart</span>
        </span>
        <button
          type="button"
          className="atc__step atc__step--plus"
          onClick={add}
          aria-label={`One more ${product.name}`}
          tabIndex={qty > 0 ? 0 : -1}
        >
          <Svg>
            <path d="M12 6v12M6 12h12" />
          </Svg>
        </button>
      </div>
    </div>
  );
}
