import { useState } from 'react';
import { Link } from 'react-router-dom';
import { features } from '../../config/features';
import { formatPrice } from '../../lib/format';
import { getDefaultPack } from '../../lib/packs';
import { hasProductImage } from '../../lib/products';
import AddToCart from './AddToCart';
import { useStock } from '../../context/StockContext';
import { categoryName } from './productOrder';

// Tamil words inside an English line, wrapped in lang="ta".
const TAMIL = /([\u0B80-\u0BFF][\u0B80-\u0BFF\s]*[\u0B80-\u0BFF]|[\u0B80-\u0BFF])/;
export function TamilAware({ text }) {
  return String(text)
    .split(TAMIL)
    .map((part, i) => (TAMIL.test(part) ? <span key={i} lang="ta">{part}</span> : part));
}

// Product tile used on Home, Products and ProductDetail "related" (original `xf`).
// The sizes can be picked: the price and Add to cart (or Enquire, for a pack
// with no stock) follow the chosen one.
export default function ProductCard({ product }) {
  const [size, setSize] = useState(() => getDefaultPack(product).size);
  const pack = product.packs.find((p) => p.size === size) ?? getDefaultPack(product);
  // A pack with no stock takes an enquiry instead of going in the cart.
  const { inStock } = useStock();
  const buyable = features.cart && inStock(product.id, pack.size) !== false;
  const href = `/products/${product.id}`;

  return (
    <article className="card" data-cat={product.category}>
      <Link to={href} className="card__media" tabIndex={-1} aria-hidden="true">
        {hasProductImage(product) ? (
          <img src={product.image} alt={`${product.fullName || product.name} pack`} loading="lazy" decoding="async" width="600" height="600" />
        ) : (
          <span className="card__monogram">
            <span className="card__initial">{product.name.charAt(0)}</span>
            <span className="card__mononame">{product.name}</span>
          </span>
        )}
        {product.bestseller && <span className="card__badge">★ Bestseller</span>}
        <span className="card__cat">{categoryName(product.category)}</span>
      </Link>
      <div className="card__body">
        <h3 className="card__title">
          <Link to={href}>{product.name}</Link>
        </h3>
        <p className="card__tagline">
          <TamilAware text={product.tagline} />
        </p>
        {product.packs.length > 0 && (
          <div className="card__packs" role="group" aria-label={`${product.name} pack size`}>
            {product.packs.map((p) => (
              <button
                key={p.size}
                type="button"
                className={`card__pack${p.size === pack.size ? ' is-on' : ''}`}
                aria-pressed={p.size === pack.size}
                onClick={() => setSize(p.size)}
              >
                {p.size}
              </button>
            ))}
          </div>
        )}
        <div className="card__foot">
          {features.prices && (
            <p className={`card__price${pack.price == null ? ' card__price--ask' : ''}`} aria-live="polite">
              {formatPrice(pack.price)}
              {pack.price != null && pack.size && <span className="card__unit">/ {pack.size}</span>}
            </p>
          )}
          <div className="card__actions">
            <Link to={href} className="card__details">
              Details
            </Link>
            {buyable ? (
              <AddToCart product={product} pack={pack} />
            ) : (
              <Link to={`/contact?product=${product.id}${pack.size ? `&size=${encodeURIComponent(pack.size)}` : ''}`} className="card__enquire">
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
