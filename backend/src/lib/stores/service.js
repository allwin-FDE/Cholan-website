// The store finder's data: the shops (Firestore "stores", one document per
// shop code), placing each on the map, and finding the nearest to a customer.
//
// Where a store sits (location.status):
//   pending      not placed yet (new, or its address changed)
//   verified     its own Google listing near the address, a pin staff set or
//                checked by hand, or coordinates given in the sheet
//   address      Google found the exact street address (not the shop itself)
//   approximate  only the road, area or pincode was found: shown to customers
//                as approximate and listed for staff to check
//   missing      Google found nothing; staff need to set the pin
//
// Customers' locations are used for the search and never saved; road
// distances are cached in memory for a few hours by a rounded point only.
// A search needs the customer's name and mobile number; each number searches
// once (store_finder_people, one document per number, with the stores found
// then, shown again on a repeat without asking Google).
import { createHash } from 'node:crypto';
import { FieldValue } from '@google-cloud/firestore';
import { config } from '../../config.js';
import { collection, firestore } from '../firestore.js';
import { addressKey, addressLine, diffStores, EDIT_FIELDS, geocodeQuery, inIndia, prettify, storesFromRows, tidy, cleanPhone, cleanDoor } from './sheet.js';
import { classifyGeocode, haversineKm, localityNamesStore, maps, matchListings, parseLocation } from './geo.js';

const col = {
  stores: () => collection('stores'),
  cache: () => collection('store_geo_cache'),
  usage: () => collection('maps_usage'),
  people: () => collection('store_finder_people'),
  devices: () => collection('store_finder_devices'),
};
const nowIso = () => new Date().toISOString();
const PLACED = ['verified', 'address', 'approximate'];
const TRUSTED = ['verified', 'address'];
// Google's terms: coordinates from Google may be kept for 30 days, then
// fetched again. Pins staff set themselves are the business's own and stay.
const FRESH_DAYS = 30;

// ---- Reading ----

let memo = null; // { at, list }
export const forget = () => {
  memo = null;
};

export async function allStores() {
  if (memo && Date.now() - memo.at < 60_000) return memo.list;
  const snap = await col.stores().get();
  const list = snap.docs.map((d) => d.data()).sort((a, b) => String(a.zone).localeCompare(String(b.zone)) || String(a.name).localeCompare(String(b.name)));
  memo = { at: Date.now(), list };
  return list;
}

export function directionsUrl(s) {
  if (s.lat == null) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Cholan Rice ${addressLine(s)}`)}`;
  const q = new URLSearchParams({ api: '1', destination: `${s.lat},${s.lng}` });
  if (s.location?.placeId) q.set('destination_place_id', s.location.placeId);
  return `https://www.google.com/maps/dir/?${q}`;
}

// What customers see: no manager names, regions or internal notes.
export function publicStore(s) {
  const placed = PLACED.includes(s.location?.status) && s.lat != null;
  return {
    code: s.code,
    name: prettify(s.name),
    address: addressLine(s),
    area: prettify(s.area),
    city: prettify(s.taluk || s.area),
    district: prettify(s.district || s.geoDistrict || s.zone),
    pincode: s.pincode,
    phone: s.phone || '',
    lat: placed ? s.lat : null,
    lng: placed ? s.lng : null,
    precision: placed ? (TRUSTED.includes(s.location.status) ? s.location.status : 'approximate') : 'unknown',
    directionsUrl: directionsUrl(placed ? s : { ...s, lat: null }),
  };
}

export function counts(list) {
  const out = { total: list.length, active: 0, verified: 0, address: 0, approximate: 0, missing: 0, pending: 0 };
  for (const s of list) {
    if (s.active === false) continue;
    out.active += 1;
    const st = s.location?.status || 'pending';
    out[st] = (out[st] || 0) + 1;
  }
  return out;
}

export async function publicStores() {
  const list = (await allStores()).filter((s) => s.active !== false);
  return list.map(publicStore);
}

// ---- Importing a sheet ----

export async function importSheet(rows, { commit = false, hideMissing = false, actor = 'system' } = {}) {
  const parsed = storesFromRows(rows);
  const existing = await allStores();
  const diff = diffStores(parsed.stores, existing, parsed.present);
  const summary = {
    columns: parsed.columns,
    unused: parsed.unused,
    invalid: parsed.invalid,
    warnings: parsed.warnings,
    added: diff.added.map(brief),
    changed: diff.changed.map((s) => ({ ...brief(s), fields: s.fields, moved: s.moved })),
    unchanged: diff.same.length,
    missing: diff.missing,
    hideMissing,
  };
  if (!commit) return summary;

  const db = firestore();
  const writes = [];
  const at = nowIso();
  const fieldsOf = (s) => ({
    ...Object.fromEntries(EDIT_FIELDS.map((f) => [f, s[f] ?? ''])),
    code: s.code,
    active: true,
    addressKey: addressKey(s),
    updatedAt: at,
    updatedBy: actor,
  });
  const sheetPin = (s) => ({ lat: s.sheetLocation.lat, lng: s.sheetLocation.lng, location: { status: 'verified', source: 'sheet', note: 'Coordinates from the uploaded sheet.', checkedAt: at, checkedBy: actor } });
  const pending = { lat: null, lng: null, location: { status: 'pending', source: null, note: 'Not placed on the map yet.' } };
  for (const s of diff.added) writes.push([col.stores().doc(s.code), { ...fieldsOf(s), createdAt: at, ...(s.sheetLocation ? sheetPin(s) : pending) }]);
  for (const s of diff.changed) {
    const old = existing.find((e) => e.code === s.code);
    const patch = fieldsOf(s);
    // Fields the sheet has no column for stay as they are; so do phones
    // typed in here when the sheet leaves them empty.
    for (const f of EDIT_FIELDS) if (!['name', 'pincode', ...parsed.present].includes(f)) patch[f] = old[f] ?? '';
    if (!s.phone && old.phone) patch.phone = old.phone;
    patch.addressKey = addressKey({ ...old, ...patch });
    if (s.sheetLocation) Object.assign(patch, sheetPin(s));
    else if (s.moved) Object.assign(patch, pending, { location: { ...pending.location, note: 'The address changed, so it needs placing again.' } });
    writes.push([col.stores().doc(s.code), patch, true]);
  }
  if (hideMissing) for (const m of diff.missing) writes.push([col.stores().doc(m.code), { active: false, updatedAt: at, updatedBy: actor }, true]);
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [ref, data, merge] of writes.slice(i, i + 400)) batch.set(ref, data, { merge: Boolean(merge) });
    await batch.commit();
  }
  forget();
  return { ...summary, saved: { added: diff.added.length, updated: diff.changed.length, hidden: hideMissing ? diff.missing.length : 0 } };
}
const brief = (s) => ({ row: s.row, code: s.code, name: s.name, area: s.area, pincode: s.pincode });

// ---- Editing one store ----

export async function updateStore(code, body, actor) {
  const ref = col.stores().doc(code);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error('Store not found.'), { status: 404 });
  const old = snap.data();
  const patch = { updatedAt: nowIso(), updatedBy: actor };
  const fields = {};
  for (const f of EDIT_FIELDS) {
    if (body[f] === undefined) continue;
    let v = tidy(body[f]);
    if (f === 'phone') {
      v = cleanPhone(v);
      if (body.phone && !v) throw Object.assign(new Error('That phone number doesn’t look right.'), { status: 400, fields: { phone: 'Use a 10-digit mobile or landline number.' } });
    }
    if (f === 'doorNo') v = cleanDoor(v);
    fields[f] = v;
  }
  if (fields.name === '') throw Object.assign(new Error('The store needs a name.'), { status: 400, fields: { name: 'Required.' } });
  if (fields.pincode !== undefined && !/^[1-9]\d{5}$/.test(fields.pincode)) throw Object.assign(new Error('The pincode must be 6 digits.'), { status: 400, fields: { pincode: '6 digits.' } });
  Object.assign(patch, fields);
  const next = { ...old, ...fields };
  if (body.active !== undefined) patch.active = Boolean(body.active);

  if (body.location !== undefined && body.location !== null) {
    const p = typeof body.location === 'string' ? parseLocation(body.location) : inIndia(Number(body.location.lat), Number(body.location.lng)) ? { lat: Number(body.location.lat), lng: Number(body.location.lng) } : null;
    if (!p) throw Object.assign(new Error('Couldn’t read a location from that. Paste a Google Maps link, or “latitude, longitude”.'), { status: 400, fields: { location: 'Not a place in India.' } });
    Object.assign(patch, { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6, location: { status: 'verified', source: 'manual', note: 'Pin set by staff.', checkedAt: nowIso(), checkedBy: actor } });
  } else if (body.confirm) {
    // Staff looked at the pin on the map and it is right.
    if (old.lat == null) throw Object.assign(new Error('This store has no pin to confirm yet.'), { status: 400 });
    patch.location = { ...old.location, status: 'verified', source: old.location?.source === 'manual' ? 'manual' : 'checked', note: 'Pin checked by staff.', checkedAt: nowIso(), checkedBy: actor };
    if (patch.location.source === 'checked') patch.location.fetchedAt = null; // now the business's own
  } else if (body.resetLocation || addressKey(next) !== addressKey(old)) {
    Object.assign(patch, { lat: null, lng: null, location: { status: 'pending', source: null, note: body.resetLocation ? 'Sent to be placed again.' : 'The address changed, so it needs placing again.' } });
  }
  patch.addressKey = addressKey(next);
  await ref.set(patch, { merge: true });
  forget();
  return (await ref.get()).data();
}

// ---- Usage caps and the lookup cache ----

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // India's date

// Counts one call of a kind for today; false when today's cap is reached.
async function allow(kind, limit) {
  if (config.maps.fake) return true;
  const ref = col.usage().doc(today());
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? snap.data()[kind] || 0 : 0;
    if (used >= limit) return false;
    tx.set(ref, { [kind]: FieldValue.increment(1), day: today() }, { merge: true });
    return true;
  });
}

export async function usageToday() {
  const snap = await col.usage().doc(today()).get();
  return { day: today(), ...(snap.exists ? snap.data() : {}), limits: { routes: config.maps.routeDailyLimit, geocodes: config.maps.geocodeDailyLimit } };
}

// Adds to today's counters ({ google: { geocode: 1 } } is +1), without
// holding up the caller; a failed count is only logged.
function bump(counts) {
  const inc = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? inc(v) : FieldValue.increment(v)]));
  return col
    .usage()
    .doc(today())
    .set({ day: today(), ...inc(counts) }, { merge: true })
    .catch((error) => console.error('[stores] usage count failed:', error.message));
}

// The Google client, with every real call counted by kind (Google's daily
// quotas count calls, and road distances by the stores measured).
function client() {
  const g = maps();
  return {
    geocode: (a) => (bump({ google: { geocode: 1 } }), g.geocode(a)),
    places: (a) => (bump({ google: { places: 1 } }), g.places(a)),
    place: (id) => (bump({ google: { place: 1 } }), g.place(id)),
    routes: (o, d) => (bump({ google: { routeElements: d.length } }), g.routes(o, d)),
  };
}

// For the usage bar in /admin > Stores: today against the limits, this
// month so far, and the last two weeks day by day.
export async function usageReport() {
  const day = today();
  const month = day.slice(0, 7);
  const dayBefore = (n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);
  const start = dayBefore(13) < `${month}-01` ? dayBefore(13) : `${month}-01`;
  const snap = await col.usage().where('day', '>=', start).get();
  const days = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const flat = (d = {}) => ({
    searches: d.searches || 0,
    searchesPopup: d.searchesPopup || 0,
    searchesNoRoad: d.searchesNoRoad || 0,
    routes: d.routes || 0,
    geocodes: d.geocodes || 0,
    geocode: d.google?.geocode || 0,
    places: d.google?.places || 0,
    place: d.google?.place || 0,
    routeElements: d.google?.routeElements || 0,
    people: d.people || 0,
    repeats: d.repeats || 0,
  });
  const sum = (rows) => rows.reduce((t, r) => Object.fromEntries(Object.keys(r).map((k) => [k, (t[k] || 0) + r[k]])), flat());
  const monthRows = [...days].filter(([id]) => id.startsWith(month)).map(([, d]) => flat(d));
  const recent = [];
  for (let i = 13; i >= 0; i -= 1) recent.push({ day: dayBefore(i), ...flat(days.get(dayBefore(i))) });
  return {
    day,
    // Midnight in India, when the counters start again.
    resetsAt: new Date(Date.parse(`${day}T00:00:00+05:30`) + 86400_000).toISOString(),
    today: flat(days.get(day)),
    month: { month, days: monthRows.length, ...sum(monthRows) },
    recent,
    limits: { routes: config.maps.routeDailyLimit, geocodes: config.maps.geocodeDailyLimit, shortlist: config.maps.shortlist, ...config.maps.googleDaily },
    configured: Boolean(config.maps.serverKey || config.maps.fake),
  };
}

const cacheId = (kind, q) => createHash('sha1').update(`${kind}:${JSON.stringify(q)}`).digest('hex');

// A Google answer, from the cache when it is fresh enough.
async function cachedAnswer(kind, q, fetcher, maxDays = FRESH_DAYS - 2) {
  const ref = col.cache().doc(cacheId(kind, q));
  const snap = await ref.get();
  if (snap.exists && Date.now() - Date.parse(snap.data().at) < maxDays * 86400_000) return snap.data().data;
  const data = await fetcher();
  await ref.set({ kind, query: JSON.stringify(q).slice(0, 500), data, at: nowIso() });
  return data;
}

// ---- Placing stores ----
//
// Two steps. Looking up (a few stores per call, as Google is asked): the
// address match and the Cholan listings near it, kept on the store as "geo".
// Then matching, over all stores together: which listing is which store
// (geo.js matchListings), and each store's pin and status from that.

// Pins the business set itself; never replaced by a lookup.
const locked = (s) => ['manual', 'sheet', 'checked'].includes(s.location?.source);

// fresh: ask Google again instead of using the cache (the 30-day refresh).
async function lookUp(store, { fresh = false } = {}) {
  const g = client();
  const cached = (kind, q, fetcher) => cachedAnswer(kind, q, fetcher, fresh ? 0 : FRESH_DAYS - 2);
  const q = geocodeQuery(store);
  let results = await cached('geocode', { q, pin: store.pincode }, () => g.geocode({ address: q, pincode: store.pincode }));
  // Nothing at that address in that pincode. Searching the words alone can
  // land on a road of the same name in another town ("Bhavani Main Road" in
  // Erode), so that answer is used only when its locality carries the
  // store's own name (the sheet's pincode is then likely wrong); otherwise
  // the pincode's own area: rough, but the right town.
  let hint = '';
  if (!results.length) {
    const notState = (r) => !(r.types || []).some((t) => ['country', 'administrative_area_level_1'].includes(t));
    const free = (await cached('geocode', { q }, () => g.geocode({ address: q }))).filter(notState);
    if (free[0] && localityNamesStore(free[0], store)) {
      results = free;
      hint = ' The pincode in the sheet may be wrong.';
    } else {
      results = await cached('geocode', { pin: store.pincode }, () => g.geocode({ pincode: store.pincode }));
      if (!results.length) results = free;
    }
  }
  const a = classifyGeocode(results[0], store.pincode);
  const anchor = a.lat != null ? { lat: a.lat, lng: a.lng, status: a.status, level: a.level, note: a.note + hint, formatted: a.formatted || '', district: a.district || '' } : { status: 'missing', note: a.note };
  const near = a.lat != null ? { lat: a.lat, lng: a.lng } : null;
  const text = ['Cholan rice', store.name, store.area !== store.name ? store.area : '', store.taluk].map(tidy).filter(Boolean).join(' ');
  const places = await cached('places', { text, near: near && [near.lat.toFixed(3), near.lng.toFixed(3)] }, () => g.places({ text, near }));
  const listings = places
    .filter((p) => /cholan/i.test(p.displayName?.text || ''))
    .map((p) => ({ id: p.id, displayName: { text: p.displayName?.text || '' }, formattedAddress: p.formattedAddress || '', location: p.location, googleMapsUri: p.googleMapsUri || '', businessStatus: p.businessStatus || '' }));
  return { anchor, listings, fetchedAt: nowIso(), addressKey: addressKey(store) };
}

// The pin and status each store gets from the lookups, all stores together.
export function placeAll(list) {
  const open = list.filter((s) => s.geo && !locked(s));
  const pool = new Map();
  for (const s of list) for (const p of s.geo?.listings || []) pool.set(p.id, p);
  // A listing a staff-set pin already sits on belongs to that store.
  const { matched, unsure } = matchListings(
    open.map((s) => ({ code: s.code, name: s.name, area: s.area, taluk: s.taluk, zone: s.zone, district: s.district, pincode: s.pincode, anchor: s.geo.anchor.lat != null ? s.geo.anchor : null })),
    [...pool.values()].filter((p) => !list.some((s) => locked(s) && s.location?.placeId === p.id)),
  );
  const out = new Map();
  for (const s of open) {
    const a = s.geo.anchor;
    const m = matched.get(s.code);
    const base = { geoDistrict: a.district || '' };
    if (m) {
      const away = m.distanceKm == null ? '' : ` (${m.distanceKm < 1 ? `${Math.round(m.distanceKm * 1000)} m` : `${m.distanceKm.toFixed(1)} km`} from the address match)`;
      out.set(s.code, {
        ...base,
        lat: m.loc.lat,
        lng: m.loc.lng,
        location: { status: 'verified', source: 'google_listing', note: `Matched its Google listing “${m.place.displayName.text}”${away}.`, placeId: m.place.id, mapsUri: m.place.googleMapsUri, listingAddress: m.place.formattedAddress, addressMatch: a.formatted || '', fetchedAt: s.geo.fetchedAt },
      });
    } else if (a.lat == null) {
      out.set(s.code, { ...base, lat: null, lng: null, location: { status: 'missing', source: 'geocode', note: [a.note, unsure.get(s.code)].filter(Boolean).join(' '), fetchedAt: s.geo.fetchedAt } });
    } else {
      out.set(s.code, { ...base, lat: a.lat, lng: a.lng, location: { status: a.status, source: 'geocode', note: [a.note, unsure.get(s.code)].filter(Boolean).join(' '), addressMatch: a.formatted || '', fetchedAt: s.geo.fetchedAt } });
    }
  }
  return out;
}

// Matches again over all stores and saves what changed.
async function settle(actor) {
  forget();
  const list = await allStores();
  const placed = placeAll(list);
  const db = firestore();
  const changes = [];
  for (const s of list) {
    const p = placed.get(s.code);
    if (!p) continue;
    if (s.lat === p.lat && s.lng === p.lng && s.location?.status === p.location.status && s.location?.note === p.location.note && s.location?.placeId === p.location.placeId) continue;
    changes.push([s.code, p]);
  }
  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    for (const [code, p] of changes.slice(i, i + 400)) batch.set(col.stores().doc(code), { ...p, updatedAt: nowIso(), updatedBy: actor }, { merge: true });
    await batch.commit();
  }
  forget();
  return changes.length;
}

const waiting = (s) => s.active !== false && !locked(s) && (!s.geo || s.geo.addressKey !== addressKey(s) || !s.location || s.location.status === 'pending');

// Looks up the next stores waiting (or the ones named), a few per call so a
// request stays short; the screen calls again until none are left. Each
// call ends by matching all stores again, so the statuses are always current.
export async function locateBatch({ codes = null, limit = 12, actor = 'system' } = {}) {
  const list = await allStores();
  const pick = codes?.length ? list.filter((s) => codes.includes(s.code) && !locked(s)) : list.filter(waiting);
  const todo = pick.slice(0, Math.min(50, limit));
  for (const s of todo) {
    const geo = await lookUp(s);
    await col.stores().doc(s.code).set({ geo, location: { ...(s.location || {}), status: s.location?.status === 'pending' || !s.location ? 'pending' : s.location.status } }, { merge: true });
  }
  await settle(actor);
  const after = await allStores();
  const byCode = new Map(after.map((s) => [s.code, s]));
  const done = todo.map((s) => ({ code: s.code, name: s.name, status: byCode.get(s.code)?.location?.status, note: byCode.get(s.code)?.location?.note }));
  const remaining = codes?.length ? pick.length - todo.length : after.filter(waiting).length;
  return { done, remaining };
}

// Looks up again the stores whose Google data is older than Google lets us
// keep (a scheduled job, a few a day). Staff pins are left alone. Also clears
// the per-device counts of earlier days.
export async function refreshStale({ limit = 25, actor = 'scheduler' } = {}) {
  await clearOldDevices().catch((error) => console.error('[stores] clearing device counts failed:', error.message));
  const cutoff = Date.now() - (FRESH_DAYS - 3) * 86400_000;
  const stale = (await allStores()).filter((s) => s.active !== false && !locked(s) && s.geo?.fetchedAt && Date.parse(s.geo.fetchedAt) < cutoff).slice(0, limit);
  for (const s of stale) await col.stores().doc(s.code).set({ geo: await lookUp(s, { fresh: true }) }, { merge: true });
  const changed = stale.length ? await settle(actor) : 0;
  return { refreshed: stale.length, changed };
}

// ---- Finding the nearest ----

// A typed pincode or place → a point (always approximate: the area's centre).
export async function resolvePlace(text) {
  const q = tidy(text).slice(0, 80);
  if (q.length < 3) throw Object.assign(new Error('Type a pincode, town or area.'), { status: 400 });
  const pin = /^\d{6}$/.test(q.replace(/\s/g, '')) ? q.replace(/\s/g, '') : null;
  const fetcher = async () => {
    if (!(await allow('geocodes', config.maps.geocodeDailyLimit))) throw Object.assign(new Error('The search is busy right now. Please try “Find stores near me”, or try again later.'), { status: 429 });
    return client().geocode(pin ? { pincode: pin } : { address: /tamil nadu|india/i.test(q) ? q : `${q}, Tamil Nadu` });
  };
  const results = await cachedAnswer('place', { q: q.toLowerCase() }, fetcher);
  // A whole state or country is not a place to measure from ("Tamil Nadu" is
  // what Google gives back for words it can't place).
  const r = results.find((x) => !(x.types || []).some((t) => ['country', 'administrative_area_level_1'].includes(t)));
  if (!r || !inIndia(r.geometry.location.lat, r.geometry.location.lng)) throw Object.assign(new Error(`Couldn’t find “${q}”. Try a 6-digit pincode or a nearby town.`), { status: 404 });
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, label: r.formatted_address.replace(/, India$/, ''), kind: pin ? 'pincode' : 'place' };
}

// Road distances for a rounded origin, kept a few hours in memory.
const routeCache = new Map();
async function roads(origin, stores) {
  const k = `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}|${stores.map((s) => s.code).join(',')}`;
  const hit = routeCache.get(k);
  if (hit && hit.until > Date.now()) return hit.value;
  if (!(await allow('routes', config.maps.routeDailyLimit))) return null;
  const value = await client().routes(origin, stores);
  if (routeCache.size > 500) routeCache.delete(routeCache.keys().next().value);
  routeCache.set(k, { value, until: Date.now() + 6 * 3600_000 });
  return value;
}

export async function nearest({ lat, lng, accuracy, q, limit = 20, from = 'page' }) {
  let origin;
  if (q) origin = await resolvePlace(q);
  else {
    if (!inIndia(Number(lat), Number(lng))) throw Object.assign(new Error('That location is outside India.'), { status: 400 });
    origin = { lat: Number(lat), lng: Number(lng), kind: 'gps', accuracyM: Number.isFinite(Number(accuracy)) ? Math.round(Number(accuracy)) : null };
  }
  const placed = (await allStores()).filter((s) => s.active !== false && s.lat != null && PLACED.includes(s.location?.status));
  if (!placed.length) return { origin, method: 'none', results: [], total: 0 };
  const byLine = placed.map((s) => ({ s, km: haversineKm(origin, s) })).sort((a, b) => a.km - b.km);
  const short = byLine.slice(0, config.maps.shortlist);
  let routes = null;
  let routeError = null;
  try {
    routes = await roads(origin, short.map(({ s }) => ({ code: s.code, lat: s.lat, lng: s.lng })));
  } catch (error) {
    routeError = error.message;
    console.error('[stores] road distances failed:', error.message);
  }
  const ranked = rank(byLine, short.length, routes, limit);
  const fallbackReason = ranked.method === 'road' ? null : routeError ? 'error' : routes === null ? 'limit' : 'no_routes';
  bump({ searches: 1, ...(from === 'popup' ? { searchesPopup: 1 } : {}), ...(fallbackReason ? { searchesNoRoad: 1 } : {}) });
  return { origin, ...ranked, fallbackReason, total: placed.length };
}

// ---- Name and mobile first, one search per number ----

// Letters (any language), spaces and the dot of an initial; at least 2.
const NAME = /^\p{L}[\p{L}\p{M} .]+$/u;

export function checkPerson({ name, phone } = {}) {
  const n = tidy(name).replace(/[<>{}]/g, '').slice(0, 60);
  const p = cleanPhone(phone);
  const fields = {};
  if (!n) fields.name = 'Please type your name.';
  else if (n.length < 2) fields.name = 'Please type your full name.';
  else if (!NAME.test(n)) fields.name = 'Please type your name using letters only.';
  if (!p) fields.phone = 'Please type a 10-digit mobile number.';
  if (Object.keys(fields).length) throw Object.assign(new Error(fields.name || fields.phone), { status: 400, fields });
  return { name: n, phone: p };
}

// Without a code sent to the phone, anyone can type a made-up number; this
// caps how many new numbers one device (by IP, stored only as a hash) can
// use in a day.
async function allowDevice(ip) {
  const limit = config.maps.numbersPerDevice;
  if (!ip || limit <= 0) return true;
  const ref = col.devices().doc(`${today()}_${createHash('sha256').update(`cholan-store-finder:${ip}`).digest('hex').slice(0, 24)}`);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = snap.exists ? snap.data().numbers || 0 : 0;
    if (used >= limit) return false;
    tx.set(ref, { day: today(), numbers: FieldValue.increment(1) }, { merge: true });
    return true;
  });
}

async function clearOldDevices() {
  const old = await col.devices().where('day', '<', today()).limit(400).get();
  if (old.empty) return;
  const batch = firestore().batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// What is kept of a search: the stores and distances, never the customer's
// own point.
const keepable = (r) => ({ ...r, origin: { label: r.origin.label || '', kind: r.origin.kind, accuracyM: r.origin.accuracyM ?? null } });

// The nearest stores for a named customer. A number's first search asks
// Google; later ones get that first answer again (no new Google calls).
export async function nearestFor({ name, phone, ip, from = 'page', where }) {
  const who = checkPerson({ name, phone });
  const ref = col.people().doc(who.phone);
  const now = nowIso();
  const before = await ref.get();
  const old = before.exists ? before.data() : null;
  if (old?.result) {
    await ref.update({ repeats: FieldValue.increment(1), lastSeenAt: now, ...(old.name !== who.name ? { otherNames: FieldValue.arrayUnion(who.name) } : {}) });
    bump({ repeats: 1 });
    return { ...old.result, repeat: true, person: { name: old.name, firstAt: old.createdAt } };
  }
  // Two searches for the same new number at once: the second waits.
  if (old && Date.now() - Date.parse(old.claimedAt || 0) < 60_000) throw Object.assign(new Error('Your search is still running. Please wait a moment.'), { status: 409 });
  if (!(await allowDevice(ip))) throw Object.assign(new Error('This phone or computer has used the store finder for several numbers today. Please call us on +91 90922 66667, or try again tomorrow.'), { status: 429 });
  await ref.set({ phone: who.phone, name: who.name, claimedAt: now });
  let result;
  try {
    result = await nearest({ ...where, from });
  } catch (error) {
    // Nothing found (a place Google can't place, a busy moment): the number
    // is not used up.
    await ref.delete().catch(() => {});
    throw error;
  }
  // The first store on the customer's list (closest), as they saw it.
  const top = result.results[0];
  await ref.set({
    phone: who.phone,
    name: who.name,
    createdAt: now,
    lastSeenAt: now,
    repeats: 0,
    from,
    how: where.q ? 'typed' : 'location',
    query: where.q ? tidy(where.q).slice(0, 80) : '',
    place: result.origin.kind === 'gps' ? '' : result.origin.label || '',
    nearest: top ? { code: top.code, name: top.name, km: top.roadKm ?? top.straightKm ?? null, byRoad: top.roadKm != null } : null,
    method: result.method,
    result: keepable(result),
  });
  bump({ people: 1 });
  return { ...result, repeat: false, person: { name: who.name, firstAt: now } };
}

// For staff: who used the finder, newest first (without the stored results).
export async function people({ limit = 1000 } = {}) {
  const snap = await col.people().orderBy('createdAt', 'desc').limit(Math.min(limit, 5000)).select('phone', 'name', 'otherNames', 'createdAt', 'lastSeenAt', 'repeats', 'from', 'how', 'query', 'place', 'nearest', 'method').get();
  return snap.docs.map((d) => d.data());
}

// The order shown: stores reached by road first, nearest by road; then the
// shortlisted ones with no road answer; then the next by straight line. The
// highlighted "nearest" is the first whose pin is trusted (never an
// approximate one). byLine: [{ s, km }] sorted by km; routes: one answer per
// shortlisted store (or null when there were none).
export function rank(byLine, shortN, routes, limit = 20) {
  const row = ({ s, km }, r) => ({
    ...publicStore(s),
    straightKm: Math.round(km * 10) / 10,
    roadKm: r?.meters != null ? Math.round(r.meters / 100) / 10 : null,
    minutes: r?.seconds != null ? Math.max(1, Math.round(r.seconds / 60)) : null,
    noRoute: Boolean(r?.none),
  });
  const shortRows = byLine.slice(0, shortN).map((x, i) => row(x, routes?.[i]));
  const withRoad = shortRows.filter((r) => r.roadKm != null).sort((a, b) => a.roadKm - b.roadKm || a.straightKm - b.straightKm);
  const without = shortRows.filter((r) => r.roadKm == null);
  const max = Math.min(30, Math.max(5, limit));
  const rest = byLine.slice(shortN, Math.max(shortN, max)).map((x) => row(x, null));
  const results = [...withRoad, ...without, ...rest].slice(0, max);
  return {
    method: withRoad.length ? 'road' : 'straight_line',
    nearestCode: results.find((r) => r.precision !== 'approximate')?.code || null,
    results,
  };
}
