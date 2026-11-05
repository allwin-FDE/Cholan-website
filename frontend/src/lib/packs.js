// Pack (size/price) helpers. Kept dependency-free so data/products.js can import it.

// Build pack objects. Each is a size ('5 kg'), or a size and its price in
// rupees (['5 kg', 520]); a size alone shows "Price on request" (original `Bn`).
export const makePacks = (...packs) =>
  packs.map((pack) => (Array.isArray(pack) ? { size: pack[0], price: pack[1] } : { size: pack, price: null }));

// Cheapest priced pack, else the first pack, else an empty placeholder (original `Zn`).
export const getDefaultPack = (product) => {
  const priced = product.packs.filter((pack) => pack.price != null);
  return priced.length
    ? priced.reduce((best, pack) => (pack.price < best.price ? pack : best))
    : (product.packs[0] ?? { size: null, price: null });
};

// Lowest price across packs, or null if none is priced (original `Wn`).
export const getLowestPrice = (product) => {
  const prices = product.packs.map((pack) => pack.price).filter((price) => price != null);
  return prices.length ? Math.min(...prices) : null;
};
