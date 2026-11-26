// The WhatsApp bot's "Find nearest store": the same search as the website's
// store finder (one search per mobile number, shared with the website), asked
// for in chat. These are the pieces that need no database: what the bot asks,
// what it makes of the answer, and the reply listing the shops.

// How long the bot waits for the name or the place before forgetting the search.
export const ASK_MINUTES = 30;

export const WEBSITE_STORES = 'https://www.cholanrice.in/stores';
export const ASK_NAME = 'To find your nearest Cholan shop, please type your name.';
export const ASK_WHERE = 'Please share your location: tap the button below. Or type your pincode or area (for example 641402 or Sulur).';

// Everything the store finder says, in English and Tamil (owner, 2026-11-25:
// the bot asks for the language first).
export const FINDER_TEXT = {
  en: {
    askName: ASK_NAME,
    askWhere: ASK_WHERE,
    nameAgain: 'Please type your name using letters only (for example: Lakshmi R).',
    thanks: (first) => `Thank you, ${first}! ${ASK_WHERE}`,
    notIndian: `The store finder works for Indian mobile numbers. See all our shops here: ${WEBSITE_STORES}`,
    placeAgain: (msg) => `${msg} Please share your location with the button below, or type a 6-digit pincode.`,
    broken: `Sorry, the store finder isn’t working right now. See all our shops: ${WEBSITE_STORES} or call +91 90922 66667.`,
  },
  ta: {
    askName: 'உங்கள் அருகிலுள்ள சோழன் கடையைக் கண்டுபிடிக்க, உங்கள் பெயரை அனுப்பவும்.',
    askWhere: 'கீழே உள்ள பட்டனைத் தட்டி உங்கள் இருப்பிடத்தைப் பகிரவும். அல்லது உங்கள் பின்கோடு அல்லது பகுதியின் பெயரை அனுப்பவும் (எ.கா. 641402 அல்லது Sulur).',
    nameAgain: 'உங்கள் பெயரை எழுத்துகளில் மட்டும் அனுப்பவும் (எ.கா. Lakshmi R).',
    thanks: (first) => `நன்றி, ${first}! கீழே உள்ள பட்டனைத் தட்டி உங்கள் இருப்பிடத்தைப் பகிரவும். அல்லது உங்கள் பின்கோடு அல்லது பகுதியின் பெயரை அனுப்பவும் (எ.கா. 641402 அல்லது Sulur).`,
    notIndian: `கடை தேடல் இந்திய மொபைல் எண்களுக்கு மட்டுமே. எங்கள் எல்லா கடைகளும்: ${WEBSITE_STORES}`,
    placeAgain: () => 'அந்த இடத்தைக் கண்டுபிடிக்க முடியவில்லை. கீழே உள்ள பட்டனில் உங்கள் இருப்பிடத்தைப் பகிரவும், அல்லது 6 இலக்க பின்கோடை அனுப்பவும்.',
    broken: `மன்னிக்கவும், இப்போது கடையைத் தேட முடியவில்லை. எங்கள் எல்லா கடைகளும்: ${WEBSITE_STORES} அல்லது +91 90922 66667 என்ற எண்ணில் அழைக்கவும்.`,
  },
};
export const finderText = (lang) => FINDER_TEXT[lang === 'ta' ? 'ta' : 'en'];

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
// directions link, then the website's full list; in English or Tamil.
export function storesReply(result, { repeat = false, firstAt = null, lang = 'en' } = {}) {
  const ta = lang === 'ta';
  const shops = (result?.results || []).slice(0, 3);
  if (!shops.length) {
    return ta
      ? `மன்னிக்கவும், அங்கு அருகில் சோழன் கடை கிடைக்கவில்லை. எங்கள் எல்லா கடைகளும்: ${WEBSITE_STORES}\nஅல்லது +91 90922 66667 என்ற எண்ணில் அழைக்கவும்.`
      : `Sorry, we couldn’t find a Cholan shop near there. See all our shops: ${WEBSITE_STORES}\nOr call us on +91 90922 66667.`;
  }
  const gps = result.origin?.kind === 'gps';
  const place = gps ? (ta ? 'உங்கள் இருப்பிடத்திற்கு' : 'your location') : result.origin?.label || (ta ? 'நீங்கள் இருக்கும் இடம்' : 'you');
  const lines = [];
  if (repeat) {
    lines.push(
      ta
        ? `இந்த எண் ஏற்கனவே கடை தேடலைப் பயன்படுத்தியுள்ளது${firstAt ? ` (${date(firstAt)})` : ''}. ஒரு எண்ணுக்கு ஒருமுறை மட்டுமே தேடலாம், அப்போது கிடைத்த கடைகள் இவை:`
        : `This number has already used the store finder${firstAt ? ` (on ${date(firstAt)})` : ''}. Each number can search once, so here are the shops we found then:`,
      '',
    );
  }
  lines.push(ta ? `📍 *${place} அருகிலுள்ள சோழன் கடைகள்*` : `📍 *Nearest Cholan shops to ${place}*`, '');
  shops.forEach((s, i) => {
    const dist = s.roadKm != null ? (ta ? `சாலை வழியாக ${km(s.roadKm)}` : `${km(s.roadKm)} by road`) : s.straightKm != null ? (ta ? `${km(s.straightKm)} (நேர்கோட்டு தூரம்)` : `${km(s.straightKm)} (straight line)`) : '';
    lines.push(`${i + 1}. *${s.name}*${dist ? ` · ${dist}` : ''}`);
    if (s.address) lines.push(`   ${s.address}`);
    if (s.phone) lines.push(`   📞 +91 ${s.phone}`);
    if (s.directionsUrl) lines.push(`   ${ta ? 'வழி' : 'Directions'}: ${s.directionsUrl}`);
    lines.push('');
  });
  if (result.method === 'straight_line') lines.push(ta ? 'சாலை தூரம் இப்போது கிடைக்கவில்லை, எனவே இவை நேர்கோட்டு தூரங்கள்.' : 'Road distances aren’t available right now, so these are straight-line distances.', '');
  lines.push(`${ta ? 'எங்கள் எல்லா கடைகளும்' : 'All our shops'}: ${WEBSITE_STORES}`);
  return lines.join('\n');
}
