// The WhatsApp bot's "Find nearest store": the same search as the website's
// store finder (one search per mobile number, shared with the website), asked
// for in chat. These are the pieces that need no database: what the bot asks,
// what it makes of the answer, and the reply listing the shops.

// How long the bot waits for the name or the place before forgetting the search.
export const ASK_MINUTES = 30;

export const ASK_NAME = 'To find your nearest Cholan shop, please type your name.';
export const ASK_WHERE = 'Please share your location: tap the button below. Or type your pincode or area (for example 641402 or Sulur).';
export const WEBSITE_STORES = 'https://www.cholanrice.in/stores';

// The customer's WhatsApp number as the 10-digit mobile the store finder uses
// (Indian numbers only), or '' for any other country.
export function mobileOf(wa) {
  const d = String(wa || '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : '';
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
}

// A WhatsApp profile name usable as the customer's name (letters, spaces and
// the dot of an initial, at least 2 letters), or ''.
export function usableName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return /^\p{L}[\p{L}\p{M} .]+$/u.test(n) ? n : '';
}

// Is the search still waiting for an answer?
export function activeAsk(contact, nowMs = Date.now()) {
  const ask = contact?.storeAsk;
  if (!ask?.stage || !ask.at) return null;
  return nowMs - Date.parse(ask.at) < ASK_MINUTES * 60_000 ? ask : null;
}

// What the customer sent while we wait for a place: a shared location, a
// pincode or area to look up, or something else (a menu number, a greeting).
export function placeFrom({ text, location }) {
  if (location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) return { lat: Number(location.lat), lng: Number(location.lng) };
  const t = String(text || '').trim();
  if (!t || /^\d{1,2}$/.test(t) || t.length > 80) return null;
  return { q: t };
}

const km = (n) => (n < 1 ? `${Math.round(n * 1000)} m` : `${(Math.round(n * 10) / 10).toLocaleString('en-IN')} km`);
const date = (iso) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

// The reply: the nearest three shops with distance, address, phone and a
// directions link, then the website's full list.
export function storesReply(result, { repeat = false, firstAt = null } = {}) {
  const shops = (result?.results || []).slice(0, 3);
  if (!shops.length) return `Sorry, we couldn’t find a Cholan shop near there. See all our shops: ${WEBSITE_STORES}\nOr call us on +91 90922 66667.`;
  const place = result.origin?.kind === 'gps' ? 'your location' : result.origin?.label || 'you';
  const lines = [];
  if (repeat) lines.push(`This number has already used the store finder${firstAt ? ` (on ${date(firstAt)})` : ''}. Each number can search once, so here are the shops we found then:`, '');
  lines.push(`📍 *Nearest Cholan shops to ${place}*`, '');
  shops.forEach((s, i) => {
    const dist = s.roadKm != null ? `${km(s.roadKm)} by road` : s.straightKm != null ? `${km(s.straightKm)} (straight line)` : '';
    lines.push(`${i + 1}. *${s.name}*${dist ? ` · ${dist}` : ''}`);
    if (s.address) lines.push(`   ${s.address}`);
    if (s.phone) lines.push(`   📞 +91 ${s.phone}`);
    if (s.directionsUrl) lines.push(`   Directions: ${s.directionsUrl}`);
    lines.push('');
  });
  if (result.method === 'straight_line') lines.push('Road distances aren’t available right now, so these are straight-line distances.', '');
  lines.push(`All our shops: ${WEBSITE_STORES}`);
  return lines.join('\n');
}
