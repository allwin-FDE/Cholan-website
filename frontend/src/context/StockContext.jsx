import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadCatalog } from '../lib/shop.js';

// Which packs are in stock, from the business database (GET /api/shop/catalog,
// lib/shop.js). Loaded once when the site opens and again every few minutes
// while the tab is open. Until it arrives, or if it can't be reached, nothing
// is shown as out of stock (inStock gives null: not known).
const StockContext = createContext({ inStock: () => null, ready: false });
const packKey = (slug, size) => `${slug}|${String(size || '').toLowerCase().replace(/\s+/g, '')}`;
const EVERY_MS = 3 * 60_000;

export function StockProvider({ children }) {
  const [stock, setStock] = useState(null); // Map of pack → true/false, once loaded

  useEffect(() => {
    let live = true;
    const load = () =>
      loadCatalog().then((catalog) => {
        if (!live || !catalog.items?.length) return;
        setStock(new Map(catalog.items.map((i) => [packKey(i.slug, i.pack_label), Boolean(i.available)])));
      });
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), EVERY_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  // true in stock, false out of stock, null not known (not loaded, or a pack
  // the database doesn't list).
  const inStock = useCallback((slug, size) => (stock && stock.has(packKey(slug, size)) ? stock.get(packKey(slug, size)) : null), [stock]);
  const value = useMemo(() => ({ inStock, ready: Boolean(stock) }), [inStock, stock]);
  return <StockContext.Provider value={value}>{children}</StockContext.Provider>;
}

export const useStock = () => useContext(StockContext);
