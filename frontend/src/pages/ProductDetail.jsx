import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ProductCard from '../components/product/ProductCard';
import AddToCart from '../components/product/AddToCart';
import { site } from '../config/site';
import { features } from '../config/features';
import { categories } from '../data/categories';
import { products } from '../data/products';
import { formatPrice } from '../lib/format';
import { getProduct, hasProductImage } from '../lib/products';
import Seo from '../components/common/Seo.jsx';
import { absoluteUrl } from '../config/seo.js';
import { aliases } from '../data/guides.js';
import { track } from '../lib/analytics.js';

// Search details for a product page: a title that names the product, its
// sizes and the town; and schema.org data describing the product and the
// path to it (Home › Products › category › product).
function productSeo(product, category) {
  const sizes = product.packs.map((p) => p.size).join(', ');
  const path = `/products/${product.id}`;
  const tamil = product.tamil ? ` (${product.tamil})` : '';
  const description = `${product.name}${tamil} from Cholan Rice and Millet Shop, Coimbatore. ${product.description}${
    sizes ? ` Available in ${sizes}.` : ''
  }`.slice(0, 300);
  const image = product.image ? absoluteUrl(product.image) : undefined;
  const prices = features.prices ? product.packs.map((p) => p.price).filter((price) => price != null) : [];
  return {
    title: `${product.name}${sizes ? ` — ${sizes}` : ''}`,
    description,
    path,
    image,
    type: 'product',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        alternateName: [product.tamil, ...(aliases[product.id] || [])].filter(Boolean),
        description: product.description,
        image,
        sku: product.id,
        category: category?.name,
        brand: { '@type': 'Brand', name: 'Cholan' },
        url: absoluteUrl(path),
        offers: prices.length
          ? {
              '@type': 'AggregateOffer',
              priceCurrency: 'INR',
              lowPrice: Math.min(...prices),
              highPrice: Math.max(...prices),
              offerCount: prices.length,
              availability: 'https://schema.org/InStock',
            }
          : undefined,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Products', item: absoluteUrl('/products') },
          category && {
            '@type': 'ListItem',
            position: 3,
            name: category.name,
            item: absoluteUrl(`/${category.slug}`),
          },
          { '@type': 'ListItem', position: category ? 4 : 3, name: product.name, item: absoluteUrl(path) },
        ].filter(Boolean),
      },
    ],
  };
}

export default function ProductDetail() {
  const { id } = useParams();
  const product = getProduct(id);
  const [packIndex, setPackIndex] = useState(0);

  useEffect(() => {
    if (!product) return;
    // `items` is Google Analytics' shape; the plain fields are what the
    // dashboard's own tracking keeps.
    track('view_item', {
      items: [{ item_id: product.id, item_name: product.name, item_category: product.category }],
      item_id: product.id,
      item_name: product.name,
      item_category: product.category,
    });
  }, [product]);

  // Products no longer sold (the millets and pulses, among others) still
  // have old links around; send them to the range rather than a dead end.
  if (!product) return <Navigate to="/products" replace />;

  const pack = product.packs[packIndex] ?? { size: null, price: null };
  const category = categories.find((c) => c.slug === product.category);
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  return (
    <>
      <Seo {...productSeo(product, category)} />
      <section className="pdp">
        <div className="container">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/products">Products</Link>
            <span>/</span>
            <Link to={`/${product.category}`}>{category?.name}</Link>
            <span>/</span>
            <strong>{product.name}</strong>
          </nav>
          <div className="pdp__grid">
            <div className="pdp__media">
              {hasProductImage(product) ? (
                <img
                  className="pdp__photo"
                  src={product.image}
                  alt={product.name}
                  fetchPriority="high"
                  decoding="async"
                />
              ) : (
                <div className="ph pdp__ph">{product.name}</div>
              )}
            </div>
            <div className="pdp__info">
              {product.featured && <span className="pdp__badge">Bestseller</span>}
              <h1>{product.name}</h1>
              <p className="pdp__tagline">{product.tagline}</p>
              {aliases[product.id] && (
                <p className="pdp__aka">Also known as: {aliases[product.id].join(', ')}</p>
              )}
              {features.prices && (
                <div className="pdp__price">
                  {formatPrice(pack.price)}
                  <span className="pdp__price-unit">
                    {pack.size == null ? '' : pack.price == null ? ` · ${pack.size}` : ` / ${pack.size}`}
                  </span>
                </div>
              )}
              <p className="pdp__desc">{product.description}</p>
              {product.packs.length > 0 && (
                <div className="pdp__packs">
                  <span className="pdp__label">Select pack size</span>
                  <div className="pdp__pack-list">
                    {product.packs.map((p, index) => (
                      <button
                        key={p.size}
                        className={`packbtn${index === packIndex ? ' packbtn--on' : ''}`}
                        onClick={() => setPackIndex(index)}
                      >
                        <strong>{p.size}</strong>
                        {features.prices && <span>{formatPrice(p.price)}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pdp__actions">
                {features.cart && pack.size && <AddToCart key={pack.size} product={product} pack={pack} className="pdp__atc" />}
                {!features.cart && (
                  <Link to={`/contact?product=${product.id}`} className="btn btn--primary">
                    Enquire
                  </Link>
                )}
                <a href={`tel:${site.phoneRaw}`} className="btn btn--ghost">
                  {features.cart ? 'Call to order' : 'Call us'}
                </a>
              </div>
              <ul className="pdp__assurance">
                <li>Packed fresh after your order is confirmed</li>
                <li>Delivery across India · bulk rates available</li>
                <li>No artificial polishing or colouring agents</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="section section--alt">
          <div className="container">
            <h2 style={{ marginBottom: 32 }}>You may also like</h2>
            <div className="grid grid--4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
