import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '../../components/common/Seo.jsx';
import { absoluteUrl } from '../../config/seo.js';
import { hasBackend } from '../../lib/api.js';
import { fetchStores } from '../../lib/stores.js';
import NotFound from '../NotFound.jsx';

// "coimbatore" <-> "Coimbatore": the district's address on the site.
export const districtSlug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// /stores/<district>: every Cholan shop in one district with its address
// (no directions or call links, owner 2026-11-25), for people searching
// "Cholan rice shop Erode". Each shop is described to Google as a grocery store.
export default function District() {
  const { district: slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!hasBackend) return;
    fetchStores()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const shops = useMemo(() => (data?.stores || []).filter((s) => districtSlug(s.district || '') === slug), [data, slug]);
  const name = shops[0]?.district;
  // Grouped by town, towns with the most shops first.
  const towns = useMemo(() => {
    const m = new Map();
    for (const s of shops) {
      const t = s.city || s.area || name;
      if (!m.has(t)) m.set(t, []);
      m.get(t).push(s);
    }
    return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [shops, name]);

  if (data && !shops.length) return <NotFound />;
  const path = `/stores/${slug}`;
  const title = name ? `Cholan Rice Shops in ${name}` : 'Cholan Rice Shops';
  const schema = name && {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Cholan rice shops in ${name}`,
    numberOfItems: shops.length,
    itemListElement: shops.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'GroceryStore',
        name: `Cholan Rice, ${s.name}`,
        parentOrganization: { '@id': `${absoluteUrl('/')}#business` },
        address: {
          '@type': 'PostalAddress',
          streetAddress: s.address,
          addressLocality: s.city || s.area,
          addressRegion: 'Tamil Nadu',
          postalCode: s.pincode,
          addressCountry: 'IN',
        },
        ...(s.lat != null && s.precision !== 'approximate' ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng } } : {}),
        ...(s.phone ? { telephone: `+91${s.phone}` } : {}),
      },
    })),
  };

  return (
    <>
      <Seo
        title={title}
        description={name ? `${shops.length} Cholan rice shops in ${name} district, with their addresses. Ponni, idli rice, seeraga samba and more.` : undefined}
        path={path}
        schema={schema || undefined}
      />
      <section className="pagehero stores-hero">
        <div className="container">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/stores">Stores</Link>
            <span>/</span>
            <strong>{name || '…'}</strong>
          </nav>
          <h1>{title}</h1>
          <p className="lede pagehero__lede">{name ? `${shops.length} Cholan ${shops.length === 1 ? 'shop' : 'shops'} in ${name} district.` : 'Loading the shops…'}</p>
        </div>
      </section>
      <section className="section stores">
        <div className="container">
          {error && <p className="notice notice--error">{error}</p>}
          {towns.map(([town, list]) => (
            <div key={town} className="district__town">
              <h2>
                {town} <span>{list.length}</span>
              </h2>
              <ul className="district__list">
                {list.map((s) => (
                  <li key={s.code}>
                    <div>
                      <strong>Cholan Rice, {s.name}</strong>
                      <span>{s.address}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
