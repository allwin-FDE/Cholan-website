import { Link } from 'react-router-dom';
import PageHero from '../../components/common/PageHero.jsx';

// /blog: the journal has no posts yet, so it renders an empty state (original `Tm`).
export default function Blog() {
  return (
    <>
      <PageHero
        title="The Cholan journal"
        lede="Recipes, farming notes and nutrition, from the mill and the fields we buy from."
      />
      <section className="section section--alt blog-empty">
        <div className="container">
          <div className="blog-empty__card">
            <span className="blog-empty__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Z" />
                <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
              </svg>
            </span>
            <h2>Our blogs are yet to be posted.</h2>
            <p>
              Recipes, farming notes and stories from the mill are on their way. Please check back
              soon.
            </p>
            <Link to="/products" className="btn btn--primary">
              Explore our products
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
