import { track } from '../../lib/analytics.js';

// "Directions": opens Google Maps with a route to the shop's pin. Only for
// shops whose pin is exact (from the area managers' list or checked by
// staff); an approximate pin could send someone to the wrong street.
export default function Directions({ store: s, from }) {
  if (s.lat == null || s.precision === 'approximate' || !s.directionsUrl) return null;
  return (
    <a href={s.directionsUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('store_directions', { store: s.code, from })}>
      Directions
    </a>
  );
}
