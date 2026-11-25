import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TN_PATH, TN_VIEWBOX, project } from '../../data/tamilNaduMap.js';
import { districtSlug } from './District.jsx';
import Directions from './Directions.jsx';

// Where each district's name sits on the map (units of the 640 × 850 map),
// picked by eye so the names stay apart in the crowded west, even on a
// phone; a dotted line joins each name to the middle of its shops.
const LABEL_AT = {
  Krishnagiri: [400, 139],
  Erode: [150, 230],
  Salem: [440, 262],
  Namakkal: [455, 332],
  Karur: [440, 402],
  Dindigul: [420, 520],
  Coimbatore: [125, 560],
  Tiruppur: [335, 600],
};
const [VW, VH] = TN_VIEWBOX.split(' ').slice(2).map(Number);

// The Stores page's map of Tamil Nadu (owner, 2026-11-25): every shop as a
// dot, each district with shops named on it; choosing a district lists its
// shops with their addresses and directions.
export default function ShopsByDistrict({ data }) {
  const [picked, setPicked] = useState(null);
  const [filter, setFilter] = useState('');

  const districts = useMemo(() => {
    const m = new Map();
    for (const s of data?.stores || []) {
      const d = s.district || 'Other';
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(s);
    }
    return [...m]
      .map(([name, shops]) => {
        const pinned = shops.filter((s) => s.lat != null);
        const lat = pinned.reduce((a, s) => a + s.lat, 0) / (pinned.length || 1);
        const lng = pinned.reduce((a, s) => a + s.lng, 0) / (pinned.length || 1);
        const at = pinned.length ? project(lat, lng) : null;
        return { name, shops: [...shops].sort((a, b) => a.name.localeCompare(b.name)), at, label: at && (LABEL_AT[name] || [at[0] + 90, at[1]]) };
      })
      .sort((a, b) => b.shops.length - a.shops.length);
  }, [data]);

  const current = districts.find((d) => d.name === picked);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return current?.shops || [];
    return (current ? current.shops : districts.flatMap((d) => d.shops)).filter((s) => `${s.name} ${s.address} ${s.pincode}`.toLowerCase().includes(f));
  }, [current, districts, filter]);

  if (!data) return null;
  const choose = (name) => {
    setPicked((p) => (p === name ? null : name));
    setFilter('');
    // The page stays where it is, so on a phone the map's change stays in
    // view; the list below changes with it (owner, 2026-11-25).
  };

  return (
    <div className="tnshops">
      <div className="tnshops__head">
        <h2>Our {data.count} shops across Tamil Nadu</h2>
        <p>Choose a district to see its shops.</p>
      </div>
      <div className="tnshops__grid">
        <div className="tnmap">
          <svg className="tnmap__svg" viewBox={TN_VIEWBOX} aria-hidden="true">
            <defs>
              <filter id="tnmap-shadow" x="-20%" y="-20%" width="160%" height="160%">
                <feDropShadow dx="18" dy="22" stdDeviation="14" floodColor="#0b1a10" floodOpacity="0.45" />
              </filter>
            </defs>
            <path className="tnmap__land" d={TN_PATH} filter="url(#tnmap-shadow)" />
            {districts.map((d) =>
              d.shops
                .filter((s) => s.lat != null)
                .map((s) => {
                  const [x, y] = project(s.lat, s.lng);
                  return <circle key={s.code} className={`tnmap__dot${picked === d.name ? ' is-on' : picked ? ' is-off' : ''}`} cx={x} cy={y} r={picked === d.name ? 5.4 : 4.2} />;
                }),
            )}
            {districts.map((d) => d.at && <line key={d.name} className={`tnmap__lead${picked === d.name ? ' is-on' : ''}`} x1={d.at[0]} y1={d.at[1]} x2={d.label[0]} y2={d.label[1]} />)}
          </svg>
          {districts.map(
            (d) =>
              d.label && (
                <button
                  key={d.name}
                  type="button"
                  className={`tnmap__name${picked === d.name ? ' is-on' : ''}`}
                  style={{ left: `${(d.label[0] / VW) * 100}%`, top: `${(d.label[1] / VH) * 100}%` }}
                  onClick={() => choose(d.name)}
                  aria-pressed={picked === d.name}
                >
                  {d.name} <span>{d.shops.length}</span>
                </button>
              ),
          )}
        </div>

        <div className="tnshops__panel">
          <div className="tnshops__chips" role="group" aria-label="Districts">
            {districts.map((d) => (
              <button key={d.name} type="button" className={`tnshops__chip${picked === d.name ? ' is-on' : ''}`} onClick={() => choose(d.name)} aria-pressed={picked === d.name}>
                {d.name} <span>{d.shops.length}</span>
              </button>
            ))}
          </div>
          <input className="input tnshops__filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={current ? `Search shops in ${current.name}` : 'Search all shops by name, area or pincode'} aria-label="Search shops" />
          {current && !filter && (
            <div className="tnshops__title">
              <h3>
                {current.name} <span>{current.shops.length} {current.shops.length === 1 ? 'shop' : 'shops'}</span>
              </h3>
              {current.name !== 'Other' && <Link to={`/stores/${districtSlug(current.name)}`}>District page →</Link>}
            </div>
          )}
          {!current && !filter && <p className="tnshops__hint">Tap a district on the map, or above, to list its shops.</p>}
          {filter && shown.length === 0 && <p className="tnshops__hint">No shop matches “{filter}”.</p>}
          {shown.length > 0 && (
            <ul className="tnshops__list">
              {shown.map((s) => (
                <li key={s.code}>
                  <div>
                    <strong>{s.name}</strong>
                    <span>{s.address}</span>
                  </div>
                  <Directions store={s} from="map-list" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
