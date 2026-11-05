import { Link } from 'react-router-dom';
import PageHero from '../components/common/PageHero.jsx';
import ProductCard from '../components/product/ProductCard';
import Seo from '../components/common/Seo.jsx';
import { absoluteUrl } from '../config/seo.js';
import { site } from '../config/site.js';
import { categories } from '../data/categories.js';
import { guides } from '../data/guides.js';
import { getProduct } from '../lib/products.js';
import { products } from '../data/products.js';

// A category's buying guide: /rice. Answers "which is the
// best …?" in plain words — which product suits which dish — then lists the
// products and the common questions. Each is a page in its own right for
// search, with the question-and-answer content search engines look for.
export default function Guide({ slug }) {
  const guide = guides[slug];
  const category = categories.find((c) => c.slug === slug);
  const list = products.filter((p) => p.category === slug);

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: guide.seoTitle,
      description: guide.seoDescription,
      url: absoluteUrl(guide.path),
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: list.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: absoluteUrl(`/products/${p.id}`),
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: guide.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: category.name, item: absoluteUrl(guide.path) },
      ],
    },
  ];

  return (
    <>
      <Seo title={guide.seoTitle} description={guide.seoDescription} path={guide.path} schema={schema} />
      <PageHero eyebrow={guide.eyebrow} title={guide.title} lede={guide.intro} />

      <section className="section guide">
        <div className="container">
          <h2 className="guide__h">Which {category.name.toLowerCase()} to choose</h2>
          <div className="guide__picks">
            {guide.picks.map((pick) => (
              <article className="guide__pick" key={pick.need}>
                <h3>{pick.need}</h3>
                <p className="guide__pick-names">
                  {pick.products
                    .map(getProduct)
                    .filter(Boolean)
                    .map((p, i, all) => (
                      <span key={p.id}>
                        <Link to={`/products/${p.id}`}>{p.name}</Link>
                        {i < all.length - 1 ? ' · ' : ''}
                      </span>
                    ))}
                </p>
                <p>{pick.why}</p>
              </article>
            ))}
          </div>

          <h2 className="guide__h">All our {category.name.toLowerCase()}</h2>
          <div className="products-grid guide__grid">
            {list.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          <h2 className="guide__h">Questions people ask</h2>
          <div className="guide__faq">
            {guide.faq.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>

          <div className="guide__cta">
            <p>
              Not sure which to pick? Call or WhatsApp <a href={`tel:${site.phoneRaw}`}>{site.phone}</a>, or ask
              our assistant in the corner.
            </p>
            <Link to="/contact" className="btn btn--primary">
              Send an enquiry
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
