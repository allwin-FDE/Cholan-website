import { Link } from 'react-router-dom';
import { site } from '../../config/site.js';

export default function BulkSection() {
  return (
    <section className="section section--deep">
      <div className="container bulk">
        <div className="bulk__copy">
          <h2>Supplying messes, caterers and retailers</h2>
          <p className="lede">
            We supply 26 kg bags and bulk millet orders to hotels, hostels, caterers and provision
            stores across Tamil Nadu. Tell us your monthly requirement and we will quote a standing
            rate.
          </p>
          <div className="row wrap gap-12" style={{ marginTop: 24 }}>
            <Link to="/contact" className="btn btn--primary">
              Request a bulk quote
            </Link>
            <a href={`tel:${site.phoneRaw}`} className="btn btn--ghost">
              Call {site.phone}
            </a>
          </div>
        </div>
        <div className="bulk__media">
          <img
            src="/images/bulk-warehouse.webp"
            alt="Rice sacks stacked on pallets in the Cholan warehouse, loaded onto a lorry"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}
