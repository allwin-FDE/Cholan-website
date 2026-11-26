import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasBackend } from '../../lib/api.js';
import { fetchStores } from '../../lib/stores.js';
import ShopsByDistrict from '../Stores/ShopsByDistrict.jsx';

// Home: the Tamil Nadu map of the shops, in place of the bulk-supply section
// (owner, 2026-11-25). The same map as the Stores page.
export default function ShopsMapSection() {
  const [data, setData] = useState(null);
  const ref = useRef(null);
  // Fetched when the section is about a screen away, not with the first view.
  useEffect(() => {
    if (!hasBackend || !ref.current) return undefined;
    const load = () =>
      fetchStores()
        .then(setData)
        .catch(() => {});
    if (!('IntersectionObserver' in window)) {
      load();
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: '1200px 0px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  if (!data) return <section className="section home-shops home-shops--wait" ref={ref} aria-hidden="true" />;
  return (
    <section className="section home-shops" ref={ref}>
      <div className="container">
        <ShopsByDistrict data={data} />
        <p className="home-shops__more">
          <Link to="/stores">Find the shop nearest to you →</Link>
        </p>
      </div>
    </section>
  );
}
