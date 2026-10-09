import { Link } from 'react-router-dom';
import { productBags } from '../storyData.js';

export default function ProductChapter() {
  return (
    <section className="ch ch--product" aria-label="Rooted in tradition, crafted for today">
      <div className="ch__stage">
        <div className="product__silhouettes" aria-hidden="true" />
        <div className="ch__copy ch__copy--centre product__copy">
          <h2 className="ch__title">
            Rooted in Tradition.
            <br />
            Crafted for Today.
          </h2>
        </div>
        <div className="product__row">
          {productBags.map((bag) => (
            <div key={bag.src} className={`product__slot product__slot--${bag.cls}`}>
              <img
                src={bag.src}
                alt={bag.alt}
                className="product__bag"
                loading="lazy"
                decoding="async"
              />
              <span className="product__shadow" aria-hidden="true" />
            </div>
          ))}
        </div>
        <div className="product__cta">
          <Link to="/products" className="story__btn story__btn--solid">
            Explore Products
          </Link>
        </div>
      </div>
    </section>
  );
}
