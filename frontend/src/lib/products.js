import { products } from '../data/products.js';

// Find a product by id (original `Hn`).
export const getProduct = (id) => products.find((product) => product.id === id);

// Only .webp product images are shown on cards/cart (original `Kn`).
export const hasProductImage = (product) => !!product.image?.endsWith('.webp');

// Products that have an image, featured ones first, limited to `limit` (original `Un`).
export const getFeaturedProducts = (limit) => {
  const withImage = products.filter((product) => hasProductImage(product));
  return [
    ...withImage.filter((product) => product.featured),
    ...withImage.filter((product) => !product.featured),
  ].slice(0, limit);
};

// What each rice is for, so "You may also like" shows rice for the same use
// (biryani rice next to biryani rice, not Ponni).
const USES = {
  'chennai-pattanam-rice': 'daily',
  'karikalan-rice': 'daily',
  'kettimelam-rice': 'daily',
  'moongil-ponni': 'daily',
  senthoora: 'daily',
  'senthoora-half-boil': 'raw',
  'thooyamalli-ponni-raw-rice': 'raw',
  'chennai-pattanam-idli-rice': 'batter',
  'kurunai-rice': 'kanji',
  'basmati-rice': 'biryani',
  'seeraga-samba': 'biryani',
};
const NEXT_USE = { daily: ['raw', 'batter'], raw: ['daily', 'kanji'], batter: ['daily', 'raw'], kanji: ['raw', 'batter'], biryani: ['daily', 'raw'] };

// Up to `limit` products: the same use first, then the nearest uses.
export function relatedProducts(product, all, limit = 4) {
  const use = USES[product.id];
  const order = [use, ...(NEXT_USE[use] || [])];
  const rank = (p) => {
    const i = order.indexOf(USES[p.id]);
    return i === -1 ? order.length : i;
  };
  return all
    .filter((p) => p.id !== product.id && p.category === product.category)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .slice(0, limit)
    .map(({ p }) => p);
}
