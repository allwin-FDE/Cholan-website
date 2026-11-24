import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import ProductCard, { TamilAware } from '../components/product/ProductCard';
import AddToCart from '../components/product/AddToCart';
import { useStock } from '../context/StockContext';
import { site } from '../config/site';
import { features } from '../config/features';
import { categories } from '../data/categories';
import { products } from '../data/products';
import { formatPrice } from '../lib/format';
import { getProduct, hasProductImage, relatedProducts } from '../lib/products';
import { whatsappOrderLink } from '../lib/whatsapp';
import { WhatsAppLogo } from '../components/common/Icon.jsx';
import Seo from '../components/common/Seo.jsx';
import { absoluteUrl } from '../config/seo.js';
import { aliases } from '../data/guides.js';
import { track } from '../lib/analytics.js';

// "1–26 kg", "26 kg": the range of pack sizes, for the page title.
function sizeRange(packs) {
  const kg = packs.map((p) => parseFloat(p.size)).filter((n) => Number.isFinite(n));
  if (!kg.length) return '';
  const lo = Math.min(...kg);
  const hi = Math.max(...kg);
  return lo === hi ? `${hi} kg` : `${lo}–${hi} kg`;
}

// Search details for a product page: a short title that names the product and
// its sizes; and schema.org data describing the product, its return policy
// and the path to it (Home › Products › category › product).
function productSeo(product, category) {
  const name = product.fullName || product.name;
  const sizes = product.packs.map((p) => p.size).join(', ');
  const range = sizeRange(product.packs);
  const path = `/products/${product.id}`;
  const tamil = product.tamil ? ` (${product.tamil})` : '';
  const description = `${name}${tamil} from Cholan Rice and Millet Shop. ${product.description}${
    sizes ? ` Available in ${sizes}.` : ''
  }`.slice(0, 300);
  const image = product.image ? absoluteUrl(product.image) : undefined;
  const prices = features.prices ? product.packs.map((p) => p.price).filter((price) => price != null) : [];
  return {
    title: `${name}${range ? `, ${range}` : ''}`,
    description,
    path,
    image,
    type: 'product',
    schema: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        alternateName: [product.name !== name ? product.name : null, product.tamil, ...(aliases[product.id] || [])].filter(Boolean),
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
              // From the Return & Refund Policy: damaged or wrong items are
              // reported within 48 hours of delivery.
              hasMerchantReturnPolicy: {
                '@type': 'MerchantReturnPolicy',
                applicableCountry: 'IN',
                returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
                merchantReturnDays: 2,
                merchantReturnLink: absoluteUrl('/policies/returns'),
              },
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
          { '@type': 'ListItem', position: category ? 4 : 3, name, item: absoluteUrl(path) },
        ].filter(Boolean),
      },
    ],
  };
}

export default function ProductDetail() {
  const { id } = useParams();
  const product = getProduct(id);
  const [packIndex, setPackIndex] = useState(0);
  const { inStock } = useStock();

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
  // A pack with no stock takes an enquiry instead of going in the cart.
  const buyable = features.cart && Boolean(pack.size) && inStock(product.id, pack.size) !== false;
  const category = categories.find((c) => c.slug === product.category);
  const related = relatedProducts(product, products, 4);
  const name = product.fullName || product.name;
  const orderLink = whatsappOrderLink(product, pack);
  const enquireLink = `/contact?product=${product.id}${pack.size ? `&size=${encodeURIComponent(pack.size)}` : ''}`;
  const onOrder = () => track('whatsapp_order', { product: product.id, size: pack.size, value: pack.price ?? undefined });

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
                  alt={`${name} pack`}
                  fetchPriority="high"
                  decoding="async"
                />
              ) : (
                <div className="ph pdp__ph">{product.name}</div>
              )}
            </div>
            <div className="pdp__info">
              {product.bestseller && <span className="pdp__badge">Bestseller</span>}
              <h1>{name}</h1>
              <p className="pdp__tagline">
                <TamilAware text={product.tagline} />
              </p>
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
                {buyable && <AddToCart key={pack.size} product={product} pack={pack} className="pdp__atc" />}
                {!buyable && (
                  <a href={orderLink} target="_blank" rel="noopener" className="btn btn--primary pdp__wa" onClick={onOrder}>
                    <WhatsAppLogo size={20} /> Order on WhatsApp
                  </a>
                )}
                {!buyable && (
                  <Link to={enquireLink} className="btn btn--ghost">
                    Enquire
                  </Link>
                )}
                <a href={`tel:+${site.phoneRaw}`} className="btn btn--ghost">
                  {buyable ? 'Call to order' : 'Call us'}
                </a>
              </div>
              <dl className="pdp__details">
                <div>
                  <dt>Net quantity</dt>
                  <dd>{pack.size || '—'}</dd>
                </div>
                <div>
                  <dt>Sold by</dt>
                  <dd>
                    {site.legalName}, {site.address.line1}, {site.address.line2} {site.address.pincode}
                  </dd>
                </div>
                <div>
                  <dt>FSSAI licence</dt>
                  <dd>{site.fssai}</dd>
                </div>
                <div>
                  <dt>Country of origin</dt>
                  <dd>India</dd>
                </div>
              </dl>
              <ul className="pdp__assurance">
                <li>Packed fresh after your order is confirmed</li>
                <li>Delivery across India · bulk rates available</li>
                <li>No artificial polishing or colouring agents</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      {!buyable && (
        <div className="pdp__bar" role="region" aria-label="Order">
          <span className="pdp__bar-what">
            <strong>{pack.size}</strong>
            {features.prices && pack.price != null && <span>{formatPrice(pack.price)}</span>}
          </span>
          <a href={orderLink} target="_blank" rel="noopener" className="btn btn--primary" onClick={onOrder}>
            <WhatsAppLogo size={18} /> Order on WhatsApp
          </a>
        </div>
      )}
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
