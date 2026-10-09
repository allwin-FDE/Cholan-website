import { getProduct } from './products.js';

export const CART_STORAGE_KEY = 'cholan-cart-v1'; // original `Jn`

// Unique cart line key for a product id + pack size (original `Xn`).
export const cartKey = (id, size) => `${id}|${size ?? ''}`;

// Read the saved cart, dropping unknown products and empty quantities (original `Qn`).
export const loadStoredCart = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(stored)
      ? stored.filter((line) => getProduct(line.id) && line.qty > 0)
      : [];
  } catch {
    return [];
  }
};
