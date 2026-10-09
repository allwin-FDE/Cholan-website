// "Price on request" for null, else ₹ with Indian digit grouping (original `Gn`).
export const formatPrice = (price) =>
  price == null ? 'Price on request' : `₹${price.toLocaleString('en-IN')}`;
