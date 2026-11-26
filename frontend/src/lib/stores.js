// The store finder's calls to the backend (/api/stores).
import { apiUrl, ApiError } from './api.js';
import { isName } from './names.js';

async function call(path, init) {
  let response;
  try {
    response = await fetch(`${apiUrl}/api/stores${path}`, init);
  } catch {
    throw new ApiError('We couldn’t reach the server. Please check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', { status: response.status });
  return data;
}

// Every open store (for the list and the map).
export const fetchStores = () => call('');

// Addresses on the site: "Coimbatore" -> "coimbatore", and each shop's own
// page, /stores/<district>/<shop> (owner, 2026-11-26).
export const slugify = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const shopPath = (s) => `/stores/${slugify(s.district || 'other')}/${slugify(s.name)}`;

// The nearest stores to a point ({ lat, lng, accuracy }) or a typed place ({ q }),
// for a customer's name and mobile number (one search per number; a repeat
// gets the first answer again, with repeat: true). from: 'popup' for the
// home page popup (counted apart in /admin).
export const findNearest = (where, { from = 'page', name, phone } = {}) =>
  call('/nearest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...where, name, phone, limit: 20, from }) });

// A 10-digit Indian mobile number from what was typed (+91, 0 and spaces
// allowed), or '' when it isn't one. The server checks the same way.
export function cleanMobile(value) {
  const d = String(value ?? '').replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
}

// The name and number, checked: { name, phone } or { errors }.
export function checkPerson({ name, phone }) {
  const errors = {};
  const n = String(name || '').trim().replace(/\s+/g, ' ');
  if (!n) errors.name = 'Please type your name.';
  else if (n.length < 2) errors.name = 'Please type your full name.';
  else if (!isName(n)) errors.name = 'Please type your name using letters only.';
  const p = cleanMobile(phone);
  if (!p) errors.phone = 'Please type a 10-digit mobile number.';
  return Object.keys(errors).length ? { errors } : { name: n, phone: p };
}

// Kept on this browser so the visitor types them once (popup and /stores).
const PERSON_KEY = 'cholan-store-person';
export function savedPerson() {
  try {
    const p = JSON.parse(localStorage.getItem(PERSON_KEY) || 'null');
    return { name: p?.name || '', phone: p?.phone || '' };
  } catch {
    return { name: '', phone: '' };
  }
}
export function rememberPerson(person) {
  try {
    localStorage.setItem(PERSON_KEY, JSON.stringify({ name: person.name, phone: person.phone }));
  } catch {
    /* private window: they type it again next time */
  }
}

// "23 Nov 2026"
export const showDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// The browser's location, asked only when the visitor presses the button.
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(Object.assign(new Error('Your browser can’t share its location. Type your pincode or area instead.'), { code: 'unsupported' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => {
        const text =
          e.code === 1
            ? 'Location permission was turned down. You can allow it in your browser’s settings, or type your pincode or area below.'
            : e.code === 3
              ? 'Finding your location took too long. Try again, or type your pincode or area below.'
              : 'Your location isn’t available right now (is location turned on?). Type your pincode or area below.';
        reject(Object.assign(new Error(text), { code: ['', 'denied', 'unavailable', 'timeout'][e.code] || 'unavailable' }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

// "1.2 km", "850 m"
export const showKm = (km) => (km == null ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);
// "12 min", "1 hr 5 min"
export const showMinutes = (m) => (m == null ? '' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
