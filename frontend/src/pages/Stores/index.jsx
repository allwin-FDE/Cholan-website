import { useEffect, useMemo, useState } from 'react';
import Seo from '../../components/common/Seo.jsx';
import { pages } from '../../config/seo.js';
import { hasBackend } from '../../lib/api.js';
import { fetchStores } from '../../lib/stores.js';

// /stores: every Cholan shop's address, by district, with a filter. Just the
// addresses, with no links (owner's decision, 2026-11-25: the store finder,
// map and directions were taken off).
export default function Stores() {
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasBackend) return;
    fetchStores()
      .then(setAll)
      .catch((e) => setError(e.message));
  }, []);

  const count = all?.count;
  // The districts with shops, most shops first ("Coimbatore, Erode … and Dindigul").
  const districts = useMemo(() => {
    const n = new Map();
    for (const s of all?.stores || []) if (s.district) n.set(s.district, (n.get(s.district) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([d]) => d);
  }, [all]);
  const where = districts.length > 1 ? `${districts.slice(0, -1).join(', ')} and ${districts.at(-1)}` : 'Coimbatore, Erode, Salem, Namakkal, Tiruppur, Krishnagiri, Karur and Dindigul';

  return (
    <>
      <Seo {...pages.stores} />
      <section className="pagehero stores-hero">
        <div className="container">
          <span className="eyebrow pagehero__eyebrow">Our stores</span>
          <h1>Cholan rice shops</h1>
          <p className="lede pagehero__lede">
            {count ? `${count} Cholan rice shops` : 'Cholan rice shops'} across {where}. Find your area below.
          </p>
        </div>
      </section>

      <section className="section stores">
        <div className="container">
          {error && <p className="notice notice--error">{error}</p>}
          {!hasBackend && <p className="notice">The shop list isn’t available on this copy of the site.</p>}
          <AllStores data={all} />
        </div>
      </section>
    </>
  );
}

// Every shop, by district, with a filter.
function AllStores({ data }) {
  const [filter, setFilter] = useState('');
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const map = new Map();
    for (const s of data?.stores || []) {
      if (f && !`${s.name} ${s.address} ${s.pincode}`.toLowerCase().includes(f)) continue;
      const g = s.district || 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(s);
    }
    return [...map].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, filter]);
  if (!data) return null;
  return (
    <div className="stores-all">
      <div className="stores-all__head">
        <h2>All {data.count} shops</h2>
        <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, area or pincode" aria-label="Filter shops" />
      </div>
      {groups.length === 0 && <p className="stores-results__note">No shop matches “{filter}”.</p>}
      {groups.map(([zone, list]) => (
        <details key={zone} className="stores-all__zone" open={Boolean(filter)}>
          <summary>
            {zone} <span>{list.length}</span>
          </summary>
          <ul>
            {list.map((s) => (
              <li key={s.code}>
                <div>
                  <strong>{s.name}</strong>
                  <span>{s.address}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
