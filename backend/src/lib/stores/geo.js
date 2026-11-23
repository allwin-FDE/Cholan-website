// Distances and Google Maps for the store finder.
//
// Pure helpers (distance, reading a pasted Google Maps link, how far to trust
// an address match, whether a Google listing is the store) and thin clients
// for the three Google APIs it uses, all with the server key:
//   Geocoding        an address or pincode → a point
//   Places (New)     "Cholan rice …" near that point → the shop's own listing
//   Routes           road distance and driving time to the nearest stores
// MAPS_FAKE=1 answers all three locally (tests), so nothing reaches Google.
import { config } from '../../config.js';
import { inIndia, tidy } from './sheet.js';

// ---- Distance ----

// Straight-line distance in km between two { lat, lng } points.
export function haversineKm(a, b) {
  const R = 6371.0088;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---- A location typed or pasted by staff ----

// "11.0168, 76.9558", a Google Maps link (…/@11.01,76.95,17z, ?q=11.01,76.95,
// …!3d11.01!4d76.95) → { lat, lng }, or null.
export function parseLocation(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const tries = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // place pin inside the link
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const re of tries) {
    const m = re.exec(s);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (inIndia(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

// ---- How far an address match can be trusted ----

const component = (result, type) => result.address_components?.find((c) => c.types.includes(type));

// A Geocoding result for a store → { lat, lng, status, note, district }.
// "address" only for an exact street address in the right pincode; anything
// coarser (a road, a neighbourhood, the pincode's centre) is "approximate"
// and is never shown as a confirmed shop location.
export function classifyGeocode(result, pincode) {
  if (!result) return { status: 'missing', note: 'Google couldn’t find this address.' };
  const { lat, lng } = result.geometry.location;
  const types = result.types || [];
  const type = result.geometry.location_type;
  const postal = component(result, 'postal_code')?.long_name || '';
  const district = (component(result, 'administrative_area_level_3') || component(result, 'administrative_area_level_2'))?.long_name || '';
  const pinOk = !postal || postal === pincode;
  const exact = ['street_address', 'premise', 'subpremise'].some((t) => types.includes(t)) && ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(type);
  // How rough: a pincode or area match can be kilometres from the shop.
  const level = exact ? 'exact' : types.includes('postal_code') ? 'pincode' : types.includes('route') ? 'road' : types.some((t) => /locality|neighborhood|political/.test(t)) ? 'area' : 'other';
  let note;
  if (exact && pinOk && !result.partial_match) return { lat, lng, status: 'address', level, note: 'Exact street address found.', district, formatted: result.formatted_address };
  if (!pinOk) note = `Google placed it in pincode ${postal}, not ${pincode}.`;
  else if (level === 'pincode') note = 'Only the pincode area was found.';
  else if (level === 'road') note = 'Only the road was found, not the shop.';
  else if (level === 'area') note = 'Only the area was found, not the shop.';
  else if (types.includes('establishment') || types.includes('point_of_interest')) note = 'Matched a nearby business, not this shop.';
  else note = 'Only an approximate location was found.';
  return { lat, lng, status: 'approximate', level, note, district, formatted: result.formatted_address };
}

// Whether a Geocoding result's locality (not its road) carries the store's
// branch or area name: "Veerakeralam" for the Veera Keralam shop.
export function localityNamesStore(result, store) {
  const names = (result?.address_components || [])
    .filter((c) => c.types.some((t) => /^(sublocality|locality|neighborhood|administrative_area_level_[45])/.test(t)))
    .map((c) => c.long_name)
    .join(', ');
  const target = outlines(names);
  const town = new Set([...outlines(store.taluk), ...outlines(store.zone), ...outlines(store.district)]);
  return [...outlines(store.name), ...outlines(store.area)].some((o) => target.has(o) && !town.has(o));
}

// ---- Which Google listing is which store? ----
//
// Many shops have their own Google listing ("Cholan Rice and Millet Shops…").
// A listing is given to a store only when it is close to the store's address
// match and names the store's own branch or area, or sits in its pincode
// close by. All listings and all stores are matched together, so a listing
// that names another of our stores goes to that store, and one that two
// stores fit about equally well is left for staff to decide.

// A word's consonant outline, so "Pallapalaym" and "Pallapalayam" match.
const outline = (w) => {
  const s = String(w || '').toLowerCase().replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  return s ? s[0] + s.slice(1).replace(/[aeiouy]/g, '') : '';
};
const GENERIC = new Set(
  'road main street nagar near opposite post office stop stand colony layout theatre school temple kovil tamil nadu india north south east west complex cholan rice millet millets shop shops private limited pvt ltd and the new old bus block extension'.split(' '),
);
const words = (text) =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
// The outlines a text names: each word, and each comma part run together
// ("Moon Road" → "moonroad", to meet a listing's "Moonroad"). A run-together
// part remembers its own words, so "Mettur Main Road" (a town and a road)
// can be dropped along with the town.
function outlines(text, parts = null) {
  const out = new Set(words(text).map(outline));
  for (const part of String(text || '').split(/[,()]/)) {
    const joined = part.toLowerCase().replace(/[^a-z]/g, '');
    const own = words(part);
    if (joined.length >= 6 && !GENERIC.has(joined) && own.length) {
      out.add(outline(joined));
      parts?.set(outline(joined), own.map(outline));
    }
  }
  return out;
}

// A door number specific enough to recognise in a listing's address ("02/05/102D").
const doorOf = (s) => {
  const d = String(s.doorNo || '').toUpperCase().replace(/\s/g, '');
  return d.length >= 5 && /\d/.test(d) && /[/-]/.test(d) ? d : '';
};

// Each store's own words (branch and area), leaving out town names shared by
// three or more stores ("Hosur", "Erode", "Tirupur"): those prove nothing.
export function storeWords(stores) {
  const seen = new Map();
  const own = new Map();
  const parts = new Map();
  for (const s of stores) {
    const mine = new Set([...outlines(s.name, parts), ...outlines(s.area, parts)]);
    own.set(s.code, mine);
    for (const o of new Set([...mine, ...outlines(s.taluk), ...outlines(s.zone), ...outlines(s.district)])) seen.set(o, (seen.get(o) || 0) + 1);
  }
  const common = new Set([...seen].filter(([, n]) => n >= 3).map(([o]) => o));
  for (const s of stores) {
    const town = new Set([...outlines(s.taluk), ...outlines(s.zone), ...outlines(s.district)]);
    const plain = (o) => common.has(o) || town.has(o);
    own.set(s.code, new Set([...own.get(s.code)].filter((o) => !plain(o) && !(parts.get(o) || []).every(plain))));
  }
  return own;
}

// A Cholan rice shop, not the "Cholan Chettinad Restaurant" or a Cholan travels.
const NOT_A_SHOP = /restaurant|hotel|mess|chettinad|biryani|bakery|sweets|travels|tours|textile|silks|hospital|clinic|school|college|lodge|residency|cafe|motors|auto|garment|jewel|mobile|pharma|medical|electric|hardware|furniture|cinema|tiffin|hall|mahal|church|nursery|academy|finance|bank|agenc/i;
export function isCholanShop(name) {
  const n = String(name || '');
  if (!/cholan/i.test(n) || NOT_A_SHOP.test(n)) return false;
  return /rice|millet/i.test(n) || words(n).length <= 4;
}

// stores: [{ code, name, area, pincode, anchor: { lat, lng, status } | null }]
// listings: Google places (id, displayName, formattedAddress, location, businessStatus)
// → { matched: Map(code → { place, loc, distanceKm }), unsure: Map(code → text) }
export function matchListings(stores, listings) {
  const own = storeWords(stores);
  const byCode = new Map(stores.map((s) => [s.code, s]));
  const offers = [];
  const unsure = new Map();
  for (const p of listings) {
    const name = p.displayName?.text || '';
    if (!isCholanShop(name) || p.businessStatus === 'CLOSED_PERMANENTLY' || !p.location) continue;
    const loc = { lat: p.location.latitude, lng: p.location.longitude };
    if (!inIndia(loc.lat, loc.lng)) continue;
    const said = new Set([...outlines(name), ...outlines(p.formattedAddress)]);
    const address = String(p.formattedAddress || '');
    // Stores near the listing whose own words it uses.
    const nearby = stores.filter((s) => !s.anchor || haversineKm(s.anchor, loc) <= (['pincode', 'area'].includes(s.anchor.level) ? 25 : 12));
    const compact = address.toUpperCase().replace(/\s/g, '');
    const namedBy = new Set(nearby.filter((s) => [...own.get(s.code)].some((o) => said.has(o)) || (doorOf(s) && compact.includes(doorOf(s)))).map((s) => s.code));
    const fits = [];
    for (const s of nearby) {
      const named = namedBy.has(s.code);
      if (!named && namedBy.size) continue; // it names another of our stores
      const pin = address.includes(s.pincode);
      const d = s.anchor ? haversineKm(s.anchor, loc) : null;
      // A store known only to its pincode or area can be far from that point,
      // so a listing that names it (and no other store) may be further off.
      const rough = ['pincode', 'area'].includes(s.anchor?.level);
      let ok;
      if (d == null) ok = named && pin;
      else if (s.anchor.status === 'address') ok = d <= 2.5 && (named || pin);
      else ok = (named && d <= (rough && namedBy.size === 1 ? 25 : 6)) || (pin && d <= 2);
      if (ok) fits.push({ code: s.code, place: p, loc, distanceKm: d, named, pin, score: (named ? 3 : 0) + (pin ? 1.5 : 0) - (d ?? 3) / 2 });
    }
    fits.sort((a, b) => b.score - a.score);
    if (!fits.length) continue;
    // Matched on pincode alone while another of our stores shares that pincode
    // nearby: it could be either (their own address matches are often rough).
    const top = fits[0];
    if (!top.named) {
      const rival = nearby.find((s) => s.code !== top.code && s.pincode === byCode.get(top.code).pincode && (!s.anchor || haversineKm(s.anchor, loc) <= 8));
      if (rival && !fits.some((f) => f.code === rival.code)) fits.splice(1, 0, { code: rival.code, score: top.score });
    }
    if (fits[1] && fits[0].score - fits[1].score < 1) {
      const text = `Possible Google listing “${name}”, ${address}: it fits ${fits
        .slice(0, 3)
        .map((f) => byCode.get(f.code).name)
        .join(' and ')}, so check which store it is.`;
      for (const f of fits.slice(0, 3)) if (!unsure.has(f.code)) unsure.set(f.code, text);
      continue;
    }
    offers.push(fits[0]);
  }
  // Best offers first; one listing per store and one store per listing.
  offers.sort((a, b) => b.score - a.score);
  const matched = new Map();
  const used = new Set();
  for (const o of offers) {
    if (matched.has(o.code) || used.has(o.place.id)) continue;
    matched.set(o.code, o);
    used.add(o.place.id);
    unsure.delete(o.code);
  }
  return { matched, unsure };
}

// ---- Google clients ----

const key = () => config.maps.serverKey;
export const mapsConfigured = () => Boolean(config.maps.fake || config.maps.serverKey);

class MapsError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
    this.code = 'maps';
  }
}

async function google(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
  const data = await r.json().catch(() => ({}));
  // Google's daily quota on the project is used up (it resets overnight).
  if (r.status === 429) throw new MapsError('Today’s Google Maps limit is used up. It resets overnight; the rest will go through tomorrow.', 429);
  if (!r.ok) throw new MapsError(`Google Maps: ${data.error?.message || r.statusText}`);
  return data;
}

// Tamil Nadu, roughly: a hint for typed places, not a fence.
const TN_BOUNDS = '8.0,76.2|13.6,80.4';

// An address or place name → Geocoding results.
async function realGeocode({ address, pincode, bias = true }) {
  const params = new URLSearchParams({ region: 'in', key: key() });
  if (address) params.set('address', address);
  params.set('components', ['country:IN', pincode ? `postal_code:${pincode}` : ''].filter(Boolean).join('|'));
  if (bias) params.set('bounds', TN_BOUNDS);
  const data = await google(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (data.status === 'ZERO_RESULTS') return [];
  if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') throw new MapsError('Today’s Google Maps limit is used up. It resets overnight; the rest will go through tomorrow.', 429);
  if (data.status !== 'OK') throw new MapsError(`Google Maps: ${data.status} ${data.error_message || ''}`.trim(), data.status === 'OVER_QUERY_LIMIT' ? 429 : 502);
  return data.results;
}

// Google listings for a text search, near a point when there is one.
async function realPlaces({ text, near, radiusM = 5000 }) {
  const body = { textQuery: text, regionCode: 'IN', languageCode: 'en', maxResultCount: 8 };
  if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: radiusM } };
  const data = await google('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key(),
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.businessStatus',
    },
    body: JSON.stringify(body),
  });
  return data.places || [];
}

// One place's current pin, by its Google place id (to keep pins fresh).
async function realPlace(id) {
  const data = await google(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'id,location,formattedAddress,businessStatus' },
  });
  return data;
}

// Road distance (m) and driving time (s) from one point to several.
async function realRoutes(origin, destinations) {
  const point = (p) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
  const data = await google('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'originIndex,destinationIndex,status,condition,distanceMeters,duration' },
    body: JSON.stringify({ origins: [point(origin)], destinations: destinations.map(point), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
  });
  const out = destinations.map(() => null);
  for (const e of Array.isArray(data) ? data : []) {
    if (e.condition === 'ROUTE_EXISTS' && e.distanceMeters != null) out[e.destinationIndex ?? 0] = { meters: e.distanceMeters, seconds: Number(String(e.duration || '0s').replace('s', '')) };
    else out[e.destinationIndex ?? 0] = { none: true };
  }
  return out;
}

// ---- Local stand-ins (MAPS_FAKE=1) ----

// A steady made-up point for a pincode, inside Tamil Nadu.
function fakePoint(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { lat: 10 + (h % 3000) / 1000, lng: 77 + ((h >>> 12) % 2000) / 1000 };
}
const fake = {
  async geocode({ address, pincode }) {
    if (/nowhere/i.test(address || '')) return [];
    const pin = pincode || /\b\d{6}\b/.exec(address || '')?.[0] || address;
    const p = fakePoint(pin);
    const exact = /\d+\/\d+/.test(address || '');
    return [
      {
        formatted_address: `${tidy(address).slice(0, 40)}, Tamil Nadu ${pin}`,
        types: exact ? ['street_address'] : ['postal_code'],
        geometry: { location: p, location_type: exact ? 'ROOFTOP' : 'APPROXIMATE' },
        address_components: [{ long_name: String(pin), types: ['postal_code'] }],
      },
    ];
  },
  async places() {
    return [];
  },
  async place(id) {
    return { id, location: null };
  },
  async routes(origin, destinations) {
    return destinations.map((d) => {
      const km = haversineKm(origin, d) * 1.3;
      return km > 400 ? { none: true } : { meters: Math.round(km * 1000), seconds: Math.round((km / 35) * 3600) };
    });
  },
};

export const maps = () =>
  config.maps.fake ? fake : { geocode: realGeocode, places: realPlaces, place: realPlace, routes: realRoutes };
