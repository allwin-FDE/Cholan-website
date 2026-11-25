import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../../lib/googleMaps.js';
import { showKm } from '../../lib/stores.js';

const BRAND = '#285737';
const GOLD = '#d29b2c';

// Shops Google could only place by area or pincode can share one point. Each
// such group is drawn as a small ring around that point (about 150 m), so
// every shop has its own pin to click. Only the drawing moves: distances and
// directions use the shop itself.
function spreadPins(stores) {
  const groups = new Map();
  for (const s of stores) {
    if (s.lat == null) continue;
    const k = `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const at = new Map();
  for (const list of groups.values()) {
    list.forEach((s, i) => {
      if (list.length === 1) return at.set(s.code, { lat: s.lat, lng: s.lng });
      const a = (2 * Math.PI * i) / list.length - Math.PI / 2;
      const r = 0.0014; // degrees, about 150 m
      at.set(s.code, { lat: s.lat + r * Math.sin(a), lng: s.lng + (r * Math.cos(a)) / Math.cos((s.lat * Math.PI) / 180) });
    });
  }
  return at;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The map beside the results: the customer (blue dot), the results numbered
// in order (the highlighted nearest in gold, approximate pins hollow) and the
// other stores as small dots. Clicking a pin shows the store with directions.
export default function StoreMap({ results, others = [], origin, selected, nearestCode, onSelect }) {
  const box = useRef(null);
  const map = useRef(null);
  const drawn = useRef([]);
  const info = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let gone = false;
    loadGoogleMaps()
      .then((maps) => {
        if (gone || !box.current) return;
        map.current = new maps.Map(box.current, {
          center: { lat: 11.0, lng: 77.5 },
          zoom: 8,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        info.current = new maps.InfoWindow();
        draw(maps);
      })
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(maps = window.google?.maps) {
    if (!maps || !map.current) return;
    drawn.current.forEach((m) => m.setMap(null));
    drawn.current = [];
    const bounds = new maps.LatLngBounds();
    const shownCodes = new Set(results.map((r) => r.code));
    const pos = spreadPins([...results, ...others.filter((s) => !shownCodes.has(s.code))]);
    for (const s of others) {
      if (s.lat == null || shownCodes.has(s.code)) continue;
      const m = new maps.Marker({
        map: map.current,
        position: pos.get(s.code),
        title: s.name,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 4, fillColor: BRAND, fillOpacity: 0.45, strokeWeight: 0 },
        zIndex: 1,
      });
      m.addListener('click', () => open(maps, m, s));
      drawn.current.push(m);
    }
    results.forEach((s, i) => {
      if (s.lat == null) return;
      const approx = s.precision === 'approximate';
      const best = s.code === nearestCode;
      const m = new maps.Marker({
        map: map.current,
        position: pos.get(s.code),
        title: s.name,
        label: { text: String(i + 1), color: approx ? BRAND : '#fff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: best ? 15 : 12,
          fillColor: best ? GOLD : approx ? '#fff' : BRAND,
          fillOpacity: 1,
          strokeColor: best ? '#7a5512' : BRAND,
          strokeWeight: 2,
        },
        zIndex: best ? 1000 : 500 - i,
      });
      m.addListener('click', () => {
        open(maps, m, s);
        onSelect?.(s.code);
      });
      m.storeCode = s.code;
      drawn.current.push(m);
      if (i < 5) bounds.extend(m.getPosition());
    });
    // A repeat search's saved answer has no customer point (it's never kept).
    if (origin && origin.lat != null && origin.lng != null) {
      const me = new maps.Marker({
        map: map.current,
        position: { lat: origin.lat, lng: origin.lng },
        title: origin.kind === 'gps' ? 'You are here' : origin.label,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#1a73e8', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        zIndex: 2000,
      });
      drawn.current.push(me);
      bounds.extend(me.getPosition());
    }
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, 48);
      maps.event.addListenerOnce(map.current, 'idle', () => {
        if (map.current.getZoom() > 15) map.current.setZoom(15);
      });
    } else if (others.length) {
      const all = new maps.LatLngBounds();
      others.forEach((s) => s.lat != null && all.extend({ lat: s.lat, lng: s.lng }));
      if (!all.isEmpty()) map.current.fitBounds(all, 24);
    }
  }

  function open(maps, marker, s) {
    const distance = s.roadKm != null ? `${showKm(s.roadKm)} by road` : s.straightKm != null ? `${showKm(s.straightKm)} straight line` : '';
    info.current.setContent(
      `<div class="storemap-info"><strong>${esc(s.name)}</strong><p>${esc(s.address)}</p>${distance ? `<p class="storemap-info__km">${esc(distance)}</p>` : ''}${
        s.precision === 'approximate' ? '<p class="storemap-info__note">Approximate location</p>' : ''
      }<a href="${esc(s.directionsUrl)}" target="_blank" rel="noopener">Get directions</a></div>`,
    );
    info.current.open({ map: map.current, anchor: marker });
  }

  // Redraw when the results change.
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, origin, nearestCode, others]);

  // Open the chosen store's pin.
  useEffect(() => {
    const maps = window.google?.maps;
    if (!maps || !selected) return;
    const m = drawn.current.find((x) => x.storeCode === selected);
    const s = results.find((r) => r.code === selected);
    if (m && s) {
      map.current.panTo(m.getPosition());
      open(maps, m, s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (failed) return <div className="storemap storemap--off">The map couldn’t load. The list has everything you need, and “Get directions” opens Google Maps.</div>;
  return <div className="storemap" ref={box} role="region" aria-label="Map of nearby Cholan stores" />;
}
