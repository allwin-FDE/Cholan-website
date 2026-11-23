// The store finder's calls to the backend (/api/stores).
import { apiUrl, ApiError } from './api.js';

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

// The nearest stores to a point ({ lat, lng, accuracy }) or a typed place ({ q }).
export const findNearest = (where) =>
  call('/nearest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...where, limit: 20 }) });

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
