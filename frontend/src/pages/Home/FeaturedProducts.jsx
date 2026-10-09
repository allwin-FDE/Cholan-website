import { Link } from 'react-router-dom';
import SectionHeading from '../../components/common/SectionHeading.jsx';
import ProductCard from '../../components/product/ProductCard.jsx';
import { getFeaturedProducts } from '../../lib/products.js';

export default function FeaturedProducts() {
  const featured = getFeaturedProducts(4);
  return (
    <section className="section showcase">
      <div className="container">
        <div className="row wrap gap-16 section-head-row">
          <SectionHeading
            title="A Grain for Every Moment"
            lede="Discover our range of premium rice and millets, crafted for every home and every meal."
          />
          <Link to="/products" className="btn btn--ghost btn--sm">
            View all products
          </Link>
        </div>
        <div className="grid grid--4">
          {featured.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
