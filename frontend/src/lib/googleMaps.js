// Loads Google Maps in the browser once, with the browser key. The key is
// public by design: Google only accepts it from cholanrice.in (and the
// preview addresses), and only for showing maps. Without a key the store
// finder still works, just without the map.
// Only the key itself: a value pasted as "NAME=key" once sent Google the
// whole line and the map refused to load (InvalidKeyMapError, 28 Nov 2026).
const key = String(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '').trim().replace(/^[A-Z_]+=/, '');
export const mapsAvailable = Boolean(key);

let loading = null;
export function loadGoogleMaps() {
  if (!key) return Promise.reject(new Error('No map key'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const callback = `__cholanMaps${Date.now()}`;
    window[callback] = () => {
      delete window[callback];
      resolve(window.google.maps);
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&region=IN&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('The map could not load.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
