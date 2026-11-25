import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasBackend } from '../../lib/api.js';
import { fetchStores } from '../../lib/stores.js';
import ShopsByDistrict from '../Stores/ShopsByDistrict.jsx';

// Home: the Tamil Nadu map of the shops, in place of the bulk-supply section
// (owner, 2026-11-25). The same map as the Stores page.
export default function ShopsMapSection() {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!hasBackend) return;
    fetchStores()
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data) return null;
  return (
    <section className="section home-shops">
      <div className="container">
        <ShopsByDistrict data={data} />
        <p className="home-shops__more">
          <Link to="/stores">Find the shop nearest to you →</Link>
        </p>
      </div>
    </section>
  );
}
