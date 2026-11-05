import { Link } from 'react-router-dom';
import Seo from '../components/common/Seo.jsx';

export default function NotFound() {
  return (
    <section className="section">
      <Seo title="Page not found" noindex />
      <div className="container center" style={{ paddingBlock: 60 }}>
        <h1>We could not find that page</h1>
        <p className="lede" style={{ maxWidth: '46ch', margin: '0 auto 30px' }}>
          The link may be out of date, or the product may have moved. Try the full product list
          instead.
        </p>
        <div className="row wrap gap-12" style={{ justifyContent: 'center' }}>
          <Link to="/products" className="btn btn--primary">
            Browse products
          </Link>
          <Link to="/" className="btn btn--ghost">
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
