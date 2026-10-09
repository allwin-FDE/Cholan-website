import { Link } from 'react-router-dom';
import SectionHeading from '../../components/common/SectionHeading.jsx';
import { categories } from '../../data/categories.js';

export default function CategoryTiles() {
  return (
    <section className="section">
      <div className="container">
        <SectionHeading
          title="What we stock"
          lede="Four ranges, all traceable back to the farm they came from."
          center
        />
        <div className="grid grid--4">
          {categories.map((category) => (
            <Link
              key={category.slug}
              to={`/products?category=${category.slug}`}
              className="cattile"
            >
              <div className="cattile__media">
                <img
                  src={`/images/categories/${category.slug}.webp`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="cattile__body">
                <h3>{category.name}</h3>
                <p>{category.blurb}</p>
                <span className="cattile__link">Explore →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
