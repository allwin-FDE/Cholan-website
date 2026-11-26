import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { districtSlug } from './District.jsx';
import Seo from '../../components/common/Seo.jsx';
import { Icon, iconPaths } from '../../components/common/Icon.jsx';
import { pages } from '../../config/seo.js';
import { hasBackend } from '../../lib/api.js';
import { mapsAvailable } from '../../lib/googleMaps.js';
import { checkPerson, currentPosition, fetchStores, shopPath, findNearest, rememberPerson, savedPerson, showDate, showKm, showMinutes } from '../../lib/stores.js';
import { track } from '../../lib/analytics.js';
import PersonFields from '../../components/stores/PersonFields.jsx';
import Directions from './Directions.jsx';

const StoreMap = lazy(() => import('./StoreMap.jsx'));

const LOCATE = 'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z';
const ROUTE = 'M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3ZM9 3v15M15 6v15';
const PAGE = 5;

// /stores: find the nearest Cholan store. The visitor gives a name and mobile
// number first (one search per number; a repeat shows the first answer).
// "Find stores near me" asks for the location only when pressed; a pincode,
// town or area works too. The nearest
// are ranked by road distance (Google), with straight-line distance only as a
// clearly marked fallback; pins Google could only place roughly say so.
export default function Stores() {
  const [params, setParams] = useSearchParams();
  // Results carried over from the home page popup ("See more stores on the
  // map"), shown without searching again.
  const carried = useLocation().state?.found || null;
  const [all, setAll] = useState(null);
  const [listError, setListError] = useState('');
  const [query, setQuery] = useState(params.get('q') || '');
  const [state, setState] = useState(carried ? 'done' : 'idle'); // idle | locating | searching | done | error
  const [error, setError] = useState('');
  const [found, setFound] = useState(carried);
  const [person, setPerson] = useState(savedPerson);
  const [personErrors, setPersonErrors] = useState({});
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    if (!hasBackend) return;
    fetchStores()
      .then(setAll)
      .catch((e) => setListError(e.message));
  }, []);

  // A shared link with ?q=641402 runs that search.
  useEffect(() => {
    const q = params.get('q');
    const known = checkPerson(savedPerson());
    if (carried) setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    else if (q && hasBackend && !known.errors) search({ q }, known);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The name and number, or null (with the mistakes shown) when not right.
  function who() {
    const c = checkPerson(person);
    setPersonErrors(c.errors || {});
    if (c.errors) {
      setError('');
      document.getElementById(`store-who-${c.errors.name ? 'name' : 'phone'}`)?.focus();
      return null;
    }
    return c;
  }

  async function search(where, me) {
    setError('');
    setState('searching');
    setSelected(null);
    try {
      const data = await findNearest(where, me);
      rememberPerson(me);
      setFound(data);
      setShown(PAGE);
      setState('done');
      track('find_store', { method: where.q ? 'search' : 'location', results: data.results.length, repeat: Boolean(data.repeat) });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch (e) {
      if (e.fields) setPersonErrors(e.fields);
      setError(e.fields ? '' : e.message);
      setState('error');
    }
  }

  async function nearMe() {
    const me = who();
    if (!me) return;
    setError('');
    setState('locating');
    try {
      const where = await currentPosition();
      if (params.get('q')) setParams({}, { replace: true });
      await search(where, me);
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  }

  function submit(event) {
    event.preventDefault();
    const me = who();
    if (!me) return;
    const q = query.trim();
    if (q.length < 3) {
      setError('Type a 6-digit pincode, or the name of your town or area.');
      return;
    }
    setParams({ q }, { replace: true });
    search({ q }, me);
  }

  const results = found?.results || [];
  const visible = results.slice(0, shown);
  const busy = state === 'locating' || state === 'searching';
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
          <span className="eyebrow pagehero__eyebrow">Store finder</span>
          <h1>Find your nearest Cholan store</h1>
          <p className="lede pagehero__lede">
            {count ? `${count} Cholan rice shops` : 'Cholan rice shops'} across {where}. Find the one closest to you, see how far it is by road, and get directions.
          </p>
        </div>
      </section>

      <section className="section stores">
        <div className="container">
          <div className="stores-search">
            <div className="stores-search__who">
              <p className="stores-search__intro">Enter your name and mobile number, then find your nearest store.</p>
              <PersonFields id="store-who" person={person} onChange={setPerson} errors={personErrors} disabled={busy || !hasBackend} />
            </div>
            <button type="button" className="btn btn--primary stores-search__near" onClick={nearMe} disabled={busy || !hasBackend}>
              <Icon d={LOCATE} />
              {state === 'locating' ? 'Finding your location…' : 'Find stores near me'}
            </button>
            <span className="stores-search__or">or</span>
            <form className="stores-search__form" onSubmit={submit} role="search">
              <label className="visually-hidden" htmlFor="store-q">
                Pincode, town or area
              </label>
              <input
                id="store-q"
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pincode, town or area (e.g. 641402 or Sulur)"
                inputMode="search"
                autoComplete="postal-code"
                maxLength={80}
              />
              <button type="submit" className="btn btn--ghost" disabled={busy || !hasBackend}>
                {state === 'searching' && !found ? 'Searching…' : 'Search'}
              </button>
            </form>
            <p className="stores-search__privacy">Each mobile number can search once. We keep your name and number so our team can help you. Your location is used only for the search and isn’t saved.</p>
            {error && (
              <p className="notice notice--error stores-search__error" role="alert">
                {error}
              </p>
            )}
            {!hasBackend && <p className="notice">The store finder isn’t available on this copy of the site.</p>}
          </div>

          {found && (
            <div className="stores-results" ref={resultsRef} aria-live="polite">
              <ResultsHeader found={found} />
              {results.length === 0 ? (
                <p className="notice">No stores could be placed on the map yet. Please call us on the number below.</p>
              ) : (
                <div className={`stores-results__grid${mapsAvailable ? '' : ' stores-results__grid--nomap'}`}>
                  <ol className="stores-list">
                    {visible.map((s, i) => (
                      <StoreCard key={s.code} store={s} rank={i + 1} nearest={s.code === found.nearestCode} method={found.method} selected={selected === s.code} onShow={() => setSelected(s.code)} />
                    ))}
                    {shown < results.length && (
                      <li className="stores-list__more">
                        <button type="button" className="btn btn--ghost" onClick={() => setShown((n) => n + PAGE)}>
                          Show {Math.min(PAGE, results.length - shown)} more stores
                        </button>
                      </li>
                    )}
                  </ol>
                  {mapsAvailable && (
                    <div className="stores-results__map">
                      <Suspense fallback={<div className="storemap" />}>
                        <StoreMap results={visible} others={all?.stores || []} origin={found.origin} selected={selected} nearestCode={found.nearestCode} onSelect={setSelected} />
                      </Suspense>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <AllStores data={all} error={listError} />
        </div>
      </section>
    </>
  );
}

function ResultsHeader({ found }) {
  const o = found.origin;
  const where =
    o.kind === 'gps' ? (
      <>
        Nearest stores to your location{o.accuracyM ? ` (accurate to about ${showKm(o.accuracyM / 1000)})` : ''}
      </>
    ) : (
      <>
        Nearest stores to <strong>{o.label}</strong>
      </>
    );
  return (
    <div className="stores-results__head">
      <h2>{where}</h2>
      {o.kind !== 'gps' && <p className="stores-results__note">Distances are measured from the middle of this {o.kind === 'pincode' ? 'pincode area' : 'place'}. For the most accurate result, use “Find stores near me”.</p>}
      {o.kind === 'gps' && o.accuracyM > 2000 && <p className="stores-results__note">Your device gave only a rough location, so distances may be off by a little.</p>}
      {found.repeat && (
        <p className="stores-results__note stores-results__note--repeat">
          This number has already been used to search{found.person?.firstAt ? ` (on ${showDate(found.person.firstAt)})` : ''}. Each number can search once, so these are the stores we found then. For help, call us on +91 90922 66667.
        </p>
      )}
      {found.method === 'straight_line' && <p className="stores-results__note stores-results__note--warn">Road distances aren’t available right now, so these are straight-line distances (as the crow flies). The road trip will be longer.</p>}
    </div>
  );
}

function StoreCard({ store: s, rank, nearest, method, selected, onShow }) {
  const approx = s.precision === 'approximate';
  return (
    <li className={`store-card${nearest ? ' store-card--nearest' : ''}${selected ? ' is-selected' : ''}`}>
      <div className="store-card__rank" aria-hidden="true">
        {rank}
      </div>
      <div className="store-card__body">
        <div className="store-card__top">
          <h3>Cholan Rice, {s.name}</h3>
          {nearest && <span className="store-badge store-badge--gold">Nearest store</span>}
          {approx && (
            <span className="store-badge" title="Google could only find this shop’s area, not its exact spot. The distance is a close estimate.">
              Approximate location
            </span>
          )}
        </div>
        <p className="store-card__address">{s.address}</p>
        <p className="store-card__distance">
          {s.roadKm != null ? (
            <>
              <strong>{showKm(s.roadKm)}</strong> by road
              {s.minutes != null && <> · about {showMinutes(s.minutes)} drive</>}
            </>
          ) : (
            <>
              <strong>{showKm(s.straightKm)}</strong> in a straight line
              {method === 'road' && <span className="store-card__muted">{s.noRoute ? ' · no road route found' : ' · road distance not checked'}</span>}
            </>
          )}
        </p>
        <div className="store-card__actions">
          <a className="btn btn--primary btn--sm" href={s.directionsUrl} target="_blank" rel="noopener" onClick={() => track('store_directions', { store: s.code })}>
            <Icon d={ROUTE} /> Get directions
          </a>
          {s.phone && (
            <a className="btn btn--ghost btn--sm" href={`tel:+91${s.phone}`} onClick={() => track('store_call', { store: s.code })}>
              <Icon d={iconPaths.phone} /> Call store
            </a>
          )}
          {mapsAvailable && s.lat != null && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onShow}>
              <Icon d={iconPaths.pin} /> Show on map
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// Every store, by district, with a filter: for browsing, and for search engines.
function AllStores({ data, error }) {
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
  if (error) return null;
  if (!data) return null;
  return (
    <div className="stores-all">
      <div className="stores-all__head">
        <h2>All {data.count} stores</h2>
        <input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name, area or pincode" aria-label="Filter stores" />
      </div>
      {groups.length === 0 && <p className="stores-results__note">No store matches “{filter}”.</p>}
      {groups.map(([zone, list]) => (
        <details key={zone} className="stores-all__zone" open={Boolean(filter)}>
          <summary>
            {zone} <span>{list.length}</span>
          </summary>
          {zone !== 'Other' && (
            <p className="stores-all__page">
              <Link to={`/stores/${districtSlug(zone)}`}>All Cholan shops in {zone} →</Link>
            </p>
          )}
          <ul>
            {list.map((s) => (
              <li key={s.code}>
                <div>
                  <strong>
                    <Link to={shopPath(s)}>{s.name}</Link>
                  </strong>
                  <span>{s.address}</span>
                </div>
                <Directions store={s} from="list" />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
