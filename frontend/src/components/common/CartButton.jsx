import { useCart } from '../../context/CartContext.jsx';

// Header cart button with item-count badge (original `tr`). Opens the cart drawer.
export default function CartButton() {
  const { count, setOpen } = useCart();
  return (
    <button
      type="button"
      className="cart-btn"
      onClick={() => setOpen(true)}
      aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      onAnimationEnd={(e) => e.currentTarget.classList.remove('cart-btn--land')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 8h14l-1.2 11.1a1.5 1.5 0 0 1-1.5 1.4H7.7a1.5 1.5 0 0 1-1.5-1.4L5 8Z" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" />
      </svg>
      {count > 0 && (
        <span key={count} className="cart-btn__count">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
