import { Link } from 'react-router-dom';

export default function EmptyCart() {
  return (
    <section className="section co">
      <div className="container co-empty">
        <span className="co-empty__icon" aria-hidden="true">
          🌾
        </span>
        <h1>Your cart is empty</h1>
        <p className="lede">Add a few packs and come back here to check out.</p>
        <Link to="/products" className="btn btn--primary">
          Browse products
        </Link>
      </div>
    </section>
  );
}
