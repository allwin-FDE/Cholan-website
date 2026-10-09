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
