import SectionHeading from '../../components/common/SectionHeading.jsx';
import { reviews } from './reviews.js';

export default function Reviews() {
  return (
    <section className="section reviews">
      <div className="container">
        <SectionHeading
          title="What our customers say"
          lede="Kitchens, messes and mothers across South India, in their own words."
          center
        />
      </div>
      <div className="marquee">
        <div className="marquee__track">
          {[0, 1, 2, 3].flatMap((copy) =>
            reviews.map((review) => (
              <figure
                key={`${copy}-${review.name}`}
                className="quote"
                aria-hidden={copy > 0 || undefined}
              >
                <div className="quote__stars" aria-label="5 out of 5">
                  ★★★★★
                </div>
                <blockquote>{review.quote}</blockquote>
                <figcaption>
                  <span className="quote__avatar" aria-hidden="true">
                    {review.name.charAt(0)}
                  </span>
                  <span className="quote__who">
                    <strong>{review.name}</strong>
                    <span>{review.city}</span>
                  </span>
                  <span className="quote__product">{review.product}</span>
                </figcaption>
              </figure>
            )),
          )}
        </div>
      </div>
    </section>
  );
}
