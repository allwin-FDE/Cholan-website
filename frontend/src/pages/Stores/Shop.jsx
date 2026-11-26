import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '../../components/common/Seo.jsx';
import { absoluteUrl } from '../../config/seo.js';
import { site } from '../../config/site.js';
import { products } from '../../data/products.js';
import { hasBackend } from '../../lib/api.js';
import { fetchStores, shopPath, slugify } from '../../lib/stores.js';
import { TN_PATH, TN_VIEWBOX, project } from '../../data/tamilNaduMap.js';
import NotFound from '../NotFound.jsx';
import Directions from './Directions.jsx';

const km = (a, b) => {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// /stores/<district>/<shop>: one Cholan shop, for searches like "Cholan rice
// Sulur" or "rice shop Sulur" and as the website of its Google Business
// Profile (owner, 2026-11-26). Address, directions, the rice it sells (in
// English and Tamil) and the nearest other Cholan shops.
export default function Shop() {
  const { district, shop } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!hasBackend) return;
    fetchStores()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const s = useMemo(() => (data?.stores || []).find((x) => slugify(x.district || '') === district && slugify(x.name) === shop), [data, district, shop]);
  const nearby = useMemo(() => {
    if (!s || s.lat == null) return [];
    return (data?.stores || [])
      .filter((x) => x.code !== s.code && x.lat != null)
      .map((x) => ({ x, d: km(s, x) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
  }, [data, s]);

  if (data && !s) return <NotFound />;
  const exact = s && s.lat != null && s.precision !== 'approximate';
  const place = s ? [s.area, s.city].filter((v, i, a) => v && a.indexOf(v) === i).join(', ') : '';
  const title = s ? `Cholan Rice Shop, ${s.name} (${s.district})` : 'Cholan Rice Shop';
  const description = s
    ? `Cholan rice shop in ${place || s.name}, ${s.district}: ${s.address}. Ponni, idli rice, seeraga samba and more. Directions and the nearest Cholan shops.`
    : undefined;
  const schema = s && {
    '@context': 'https://schema.org',
    '@type': 'GroceryStore',
    '@id': `${absoluteUrl(shopPath(s))}#shop`,
    name: `Cholan Rice, ${s.name}`,
    alternateName: `சோழன் அரிசி கடை, ${s.name}`,
    url: absoluteUrl(shopPath(s)),
    image: absoluteUrl('/images/og-cover.jpg'),
    brand: { '@type': 'Brand', name: 'Cholan Rice' },
    parentOrganization: { '@id': `${absoluteUrl('/')}#business` },
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address,
      addressLocality: s.city || s.area,
      addressRegion: 'Tamil Nadu',
      postalCode: s.pincode,
      addressCountry: 'IN',
    },
    ...(exact ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng }, hasMap: s.directionsUrl } : {}),
    ...(s.phone ? { telephone: `+91${s.phone}` } : {}),
  };
  const dot = s?.lat != null ? project(s.lat, s.lng) : null;

  return (
    <>
      <Seo title={title} description={description} path={s ? shopPath(s) : `/stores/${district}/${shop}`} schema={schema || undefined} />
      <section className="pagehero stores-hero">
        <div className="container">
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/stores">Stores</Link>
            <span>/</span>
            {s ? <Link to={`/stores/${district}`}>{s.district}</Link> : <span>…</span>}
            <span>/</span>
            <strong>{s?.name || '…'}</strong>
          </nav>
          <h1>{s ? `Cholan Rice, ${s.name}` : 'Cholan Rice shop'}</h1>
          {s && (
            <p className="lede pagehero__lede">
              Rice shop in {place || s.name}, {s.district} district.
              <br />
              <span lang="ta">சோழன் அரிசி கடை, {s.name}.</span>
            </p>
          )}
        </div>
      </section>
      <section className="section stores">
        <div className="container">
          {error && <p className="notice notice--error">{error}</p>}
          {s && (
            <div className="shop-page">
              <div className="shop-page__main">
                <div className="shop-page__card">
                  <h2>Address</h2>
                  <p className="shop-page__address">{s.address}</p>
                  <div className="shop-page__actions">
                    {exact && (
                      <a className="btn btn--primary btn--sm" href={s.directionsUrl} target="_blank" rel="noopener noreferrer">
                        Get directions
                      </a>
                    )}
                    <a className="btn btn--ghost btn--sm" href={`tel:+${site.phoneRaw}`}>
                      Call {site.phone}
                    </a>
                  </div>
                  {!exact && <p className="shop-page__note">Map directions for this shop are being checked. Call us for the way.</p>}
                </div>

                <div className="shop-page__card">
                  <h2>Rice at Cholan shops</h2>
                  <p className="shop-page__sub" lang="ta">
                    சோழன் கடைகளில் கிடைக்கும் அரிசி
                  </p>
                  <ul className="shop-page__rice">
                    {products.map((p) => (
                      <li key={p.id}>
                        <Link to={`/products/${p.id}`}>
                          <strong>{p.name}</strong>
                          {p.tamil && <span lang="ta">{p.tamil}</span>}
                        </Link>
                        <small>{p.packs.map((k) => k.size).join(' · ')}</small>
                      </li>
                    ))}
                  </ul>
                  <p className="shop-page__note">Ask at the shop for the packs in stock today.</p>
                </div>
              </div>

              <aside className="shop-page__side">
                {dot && (
                  <div className="shop-page__map" aria-hidden="true">
                    <svg viewBox={TN_VIEWBOX}>
                      <path d={TN_PATH} className="shop-page__land" />
                      <circle cx={dot[0]} cy={dot[1]} r="26" className="shop-page__halo" />
                      <circle cx={dot[0]} cy={dot[1]} r="12" className="shop-page__dot" />
                    </svg>
                  </div>
                )}
                {nearby.length > 0 && (
                  <div className="shop-page__card">
                    <h2>Nearest other Cholan shops</h2>
                    <ul className="shop-page__near">
                      {nearby.map(({ x, d }) => (
                        <li key={x.code}>
                          <Link to={shopPath(x)}>{x.name}</Link>
                          <span>about {d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`}</span>
                          <Directions store={x} from="shop-page" />
                        </li>
                      ))}
                    </ul>
                    <p className="shop-page__more">
                      <Link to={`/stores/${district}`}>All Cholan shops in {s.district} →</Link>
                    </p>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
