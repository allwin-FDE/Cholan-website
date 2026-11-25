import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon, iconPaths } from '../common/Icon.jsx';
import { hasBackend } from '../../lib/api.js';
import { checkPerson, currentPosition, findNearest, rememberPerson, savedPerson, showDate, showKm, showMinutes } from '../../lib/stores.js';
import { track } from '../../lib/analytics.js';
import PersonFields from './PersonFields.jsx';

const LOCATE = 'M12 2v3M12 19v3M2 12h3M19 12h3M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z';
const ROUTE = 'M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3ZM9 3v15M15 6v15';
const CLOSE = 'M6 6l12 12M18 6 6 18';
const SHOWN = 3;
// Opens by itself once, a few seconds into the home page, then not again for
// a week on that browser; the "Find a store" button brings it back any time.
const AUTO_KEY = 'cholan-store-popup';
const AUTO_DELAY_MS = 6000;
const AUTO_EVERY_MS = 7 * 86400_000;

function seenRecently() {
  try {
    return Date.now() - Number(localStorage.getItem(AUTO_KEY) || 0) < AUTO_EVERY_MS;
  } catch {
    return true;
  }
}
function markSeen() {
  try {
    localStorage.setItem(AUTO_KEY, String(Date.now()));
  } catch {
    /* private window: it may open again next visit */
  }
}

// Opens the popup from anywhere on the home page (the hero's button).
export const openStoreFinder = () => window.dispatchEvent(new Event('store-finder:open'));

// The store finder in a popup on the home page: name and mobile number, then
// "Find stores near me" or a pincode, and the three nearest by road with
// directions. Each number searches once; a repeat shows the first answer. No map here (each
// map costs a Google map load); "See all on the map" carries the results to
// /stores without searching again.
export default function StoreFinderPopup() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState('idle'); // idle | locating | searching | done | error
  const [error, setError] = useState('');
  const [found, setFound] = useState(null);
  const [person, setPerson] = useState(savedPerson);
  const [personErrors, setPersonErrors] = useState({});
  const dialogRef = useRef(null);
  const overlayRef = useRef(null);
  const openerRef = useRef(null);
  const autoRef = useRef(false); // opened by itself (not by the button)
  const navigate = useNavigate();

  // Once, a few seconds in, unless a cart or chat is already open.
  useEffect(() => {
    if (!hasBackend || seenRecently()) return undefined;
    const timer = setTimeout(() => {
      if (document.querySelector('.cart--open, .chatx--open')) return;
      markSeen();
      openerRef.current = document.activeElement;
      autoRef.current = true;
      setOpen(true);
      track('store_popup_open', { how: 'auto' });
    }, AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // While open: focus inside, Escape closes, the page behind stays still (the
  // home page's snap scrolling listens on the window, so wheel, touch and keys
  // stop here), and Tab stays inside the popup.
  useEffect(() => {
    if (!open) return undefined;
    const overlay = overlayRef.current;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    // Opened by itself: the popup (a text box would pop up a phone's keyboard
    // unasked). Opened by the button: the name box when it's empty, else
    // straight to "Find stores near me".
    const nameBox = dialogRef.current?.querySelector('#storepop-who-name');
    if (autoRef.current) dialogRef.current?.focus({ preventScroll: true });
    else (nameBox && !nameBox.value ? nameBox : dialogRef.current?.querySelector('button.storepop__near'))?.focus();
    const stop = (e) => e.stopPropagation();
    // On the window, first (capture): keys reach here even when focus has
    // dropped to the page, and go no further (the snap scroll, the chat).
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab' && !dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...dialogRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')];
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    overlay.addEventListener('wheel', stop, { passive: true });
    overlay.addEventListener('touchstart', stop, { passive: true });
    overlay.addEventListener('touchmove', stop, { passive: true });
    window.addEventListener('keydown', onKey, true);
    return () => {
      root.style.overflow = before;
      overlay.removeEventListener('wheel', stop);
      overlay.removeEventListener('touchstart', stop);
      overlay.removeEventListener('touchmove', stop);
      window.removeEventListener('keydown', onKey, true);
      openerRef.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    const onOpen = () => {
      openerRef.current = document.activeElement;
      autoRef.current = false;
      markSeen();
      setOpen(true);
      track('store_popup_open', { how: 'hero' });
    };
    window.addEventListener('store-finder:open', onOpen);
    return () => window.removeEventListener('store-finder:open', onOpen);
  }, []);

  function show() {
    openerRef.current = document.activeElement;
    autoRef.current = false;
    markSeen();
    setOpen(true);
    track('store_popup_open', { how: 'button' });
  }

  // The name and number, or null (with the mistakes shown) when not right.
  function who() {
    const c = checkPerson(person);
    setPersonErrors(c.errors || {});
    if (c.errors) {
      setError('');
      dialogRef.current?.querySelector(`#storepop-who-${c.errors.name ? 'name' : 'phone'}`)?.focus();
      return null;
    }
    return c;
  }

  async function search(where, me) {
    setError('');
    setFound(null);
    setState('searching');
    try {
      const data = await findNearest(where, { from: 'popup', ...me });
      rememberPerson(me);
      setFound(data);
      setState('done');
      track('find_store', { method: where.q ? 'search' : 'location', results: data.results.length, from: 'popup', repeat: Boolean(data.repeat) });
    } catch (e) {
      if (e.fields) setPersonErrors(e.fields);
      setError(e.fields ? '' : e.message);
      setState('error');
    }
    // The button pressed was disabled while searching, which drops focus to
    // the page; bring it back to the popup.
    setTimeout(() => {
      const d = dialogRef.current;
      if (d && !d.contains(document.activeElement)) d.focus({ preventScroll: true });
    }, 0);
  }

  async function nearMe() {
    const me = who();
    if (!me) return;
    setError('');
    setFound(null);
    setState('locating');
    try {
      await search(await currentPosition(), me);
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
    search({ q }, me);
  }

  function seeAll() {
    setOpen(false);
    navigate(found?.origin?.kind === 'gps' || !query.trim() ? '/stores' : `/stores?q=${encodeURIComponent(query.trim())}`, { state: { found } });
  }

  const busy = state === 'locating' || state === 'searching';
  const results = found?.results || [];

  return (
    <>
      {hasBackend && (
        <button type="button" className="storepop-launch" onClick={show} aria-haspopup="dialog">
          <Icon d={iconPaths.pin} />
          <span>Find a store</span>
        </button>
      )}
      {open &&
        createPortal(
          <div className="storepop" ref={overlayRef}>
            <div className="storepop__backdrop" onClick={() => setOpen(false)} />
            <div className="storepop__dialog" role="dialog" aria-modal="true" aria-labelledby="storepop-title" tabIndex={-1} ref={dialogRef}>
              <button type="button" className="storepop__close" onClick={() => setOpen(false)} aria-label="Close">
                <Icon d={CLOSE} />
              </button>
              <span className="eyebrow storepop__eyebrow">Store finder</span>
              <h2 id="storepop-title">Find your nearest Cholan store</h2>
              <p className="storepop__lede">Over 270 Cholan rice shops across eight districts, from Coimbatore and Erode to Salem and Hosur. Enter your name and mobile number to search.</p>
              <PersonFields id="storepop-who" person={person} onChange={setPerson} errors={personErrors} disabled={busy} />

              <button type="button" className="btn btn--primary storepop__near" onClick={nearMe} disabled={busy}>
                <Icon d={LOCATE} />
                {state === 'locating' ? 'Finding your location…' : 'Find stores near me'}
              </button>
              <p className="storepop__or">or type your pincode or area</p>
              <form className="storepop__form" onSubmit={submit} role="search">
                <label className="visually-hidden" htmlFor="storepop-q">
                  Pincode, town or area
                </label>
                <input
                  id="storepop-q"
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. 641402 or Sulur"
                  inputMode="search"
                  autoComplete="postal-code"
                  maxLength={80}
                />
                <button type="submit" className="btn btn--ghost" disabled={busy}>
                  {state === 'searching' ? 'Searching…' : 'Search'}
                </button>
              </form>
              {error && (
                <p className="notice notice--error storepop__error" role="alert">
                  {error}
                </p>
              )}

              {found && (
                <div className="storepop__results" aria-live="polite">
                  <h3>
                    {found.origin.kind === 'gps' ? 'Nearest to you' : <>Nearest to {found.origin.label}</>}
                  </h3>
                  {found.repeat && (
                    <p className="storepop__note storepop__note--repeat">
                      This number has already been used to search{found.person?.firstAt ? ` (on ${showDate(found.person.firstAt)})` : ''}. Each number can search once, so these are the stores we found then. For help, call us on +91 90922 66667.
                    </p>
                  )}
                  {found.method === 'straight_line' && <p className="storepop__note">Road distances aren’t available right now, so these are straight-line distances.</p>}
                  {results.length === 0 ? (
                    <p className="storepop__note">No stores could be found near there. Please call us on +91 90922 66667.</p>
                  ) : (
                    <ol className="storepop__list">
                      {results.slice(0, SHOWN).map((s) => (
                        <li key={s.code} className={s.code === found.nearestCode ? 'is-nearest' : ''}>
                          <div className="storepop__store">
                            <strong>Cholan Rice, {s.name}</strong>
                            {s.code === found.nearestCode && <span className="store-badge store-badge--gold">Nearest</span>}
                            <span className="storepop__address">{s.address}</span>
                            <span className="storepop__distance">
                              {s.roadKm != null ? (
                                <>
                                  <b>{showKm(s.roadKm)}</b> by road{s.minutes != null && <> · about {showMinutes(s.minutes)}</>}
                                </>
                              ) : (
                                <>
                                  <b>{showKm(s.straightKm)}</b> in a straight line
                                </>
                              )}
                            </span>
                          </div>
                          <div className="storepop__actions">
                            <a className="btn btn--primary btn--sm" href={s.directionsUrl} target="_blank" rel="noopener" onClick={() => track('store_directions', { store: s.code, from: 'popup' })}>
                              <Icon d={ROUTE} /> Directions
                            </a>
                            {s.phone && (
                              <a className="btn btn--ghost btn--sm" href={`tel:+91${s.phone}`} onClick={() => track('store_call', { store: s.code, from: 'popup' })}>
                                <Icon d={iconPaths.phone} /> Call
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                  <button type="button" className="storepop__all" onClick={seeAll}>
                    See more stores on the map →
                  </button>
                </div>
              )}
              <p className="storepop__privacy">Each mobile number can search once. We keep your name and number so our team can help you. Your location is used only for the search and isn’t saved.</p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
