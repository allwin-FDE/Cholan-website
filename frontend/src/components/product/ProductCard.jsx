import { Link } from 'react-router-dom';
import { features } from '../../config/features';
import { formatPrice } from '../../lib/format';
import { getLowestPrice } from '../../lib/packs';
import { hasProductImage } from '../../lib/products';
import AddToCart from './AddToCart';
import { categoryName } from './productOrder';

// Product tile used on Home, Products and ProductDetail "related" (original `xf`).
export default function ProductCard({ product }) {
  const lowest = getLowestPrice(product);
  const showFrom = lowest != null && product.packs.length > 1;
  const href = `/products/${product.id}`;

  return (
    <article className="card" data-cat={product.category}>
      <Link to={href} className="card__media" tabIndex={-1} aria-hidden="true">
        {hasProductImage(product) ? (
          <img src={product.image} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="card__monogram">
            <span className="card__initial">{product.name.charAt(0)}</span>
            <span className="card__mononame">{product.name}</span>
          </span>
        )}
        {product.featured && <span className="card__badge">★ Bestseller</span>}
        <span className="card__cat">{categoryName(product.category)}</span>
      </Link>
      <div className="card__body">
        <h3 className="card__title">
          <Link to={href}>{product.name}</Link>
        </h3>
        <p className="card__tagline">{product.tagline}</p>
        {product.packs.length > 0 && (
          <ul className="card__packs" aria-label="Pack sizes">
            {product.packs.map((pack) => (
              <li key={pack.size}>{pack.size}</li>
            ))}
          </ul>
        )}
        <div className="card__foot">
          {features.prices && (
            <p className={`card__price${lowest == null ? ' card__price--ask' : ''}`}>
              {showFrom && <span className="card__from">from</span>}
              {formatPrice(lowest)}
            </p>
          )}
          <div className="card__actions">
            <Link to={href} className="card__details">
              Details
            </Link>
            {features.cart ? (
              <AddToCart product={product} />
            ) : (
              <Link to={`/contact?product=${product.id}`} className="card__enquire">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 5h16v11H8l-4 4V5Z"
                  />
                </svg>
                Enquire
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
