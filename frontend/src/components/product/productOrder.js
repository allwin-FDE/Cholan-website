import { categories } from '../../data/categories';

// Category slug -> display name (original `bf`).
export const categoryName = (slug) => categories.find((c) => c.slug === slug)?.name ?? '';

// Products pinned to the top of listings, in this order (original `fm`).
export const PINNED_PRODUCT_IDS = ['chennai-pattinam-idli-rice', 'karikalan-rice', 'moongil-ponni'];

// Sort key: index in the pinned list, otherwise after all pinned ones (original `pm`).
export const pinnedRank = (product) => {
  const index = PINNED_PRODUCT_IDS.indexOf(product.id);
  return index < 0 ? PINNED_PRODUCT_IDS.length : index;
};
