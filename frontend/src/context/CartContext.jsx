import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CART_STORAGE_KEY, cartKey, loadStoredCart } from '../lib/cart.js';
import { getProduct } from '../lib/products.js';

const CartContext = createContext(null);

// Cart state (persisted to localStorage) plus the drawer open/closed flag.
// Value: { items, count, subtotal, hasUnpriced, qtyOf, setQty, add, clear, open, setOpen }
export function CartProvider({ children }) {
  const [lines, setLines] = useState(loadStoredCart);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    } catch {}
  }, [lines]);

  // Set a line's quantity (<= 0 removes it); keeps its position, caps at 99.
  const setQty = useCallback((id, size, qty) => {
    const key = cartKey(id, size);
    setLines((current) => {
      const others = current.filter((line) => cartKey(line.id, line.size) !== key);
      if (qty <= 0) return others;
      const index = current.findIndex((line) => cartKey(line.id, line.size) === key);
      const next = { id, size, qty: Math.min(qty, 99) };
      if (index >= 0) others.splice(index, 0, next);
      else others.push(next);
      return others;
    });
  }, []);

  const value = useMemo(() => {
    const qtyOf = (id, size) =>
      lines.find((line) => cartKey(line.id, line.size) === cartKey(id, size))?.qty ?? 0;
    const items = lines.map((line) => {
      const product = getProduct(line.id);
      const price = product.packs.find((pack) => pack.size === line.size)?.price ?? null;
      return {
        ...line,
        key: cartKey(line.id, line.size),
        product,
        price,
        total: price == null ? null : price * line.qty,
      };
    });
    return {
      items,
      count: lines.reduce((sum, line) => sum + line.qty, 0),
      subtotal: items.reduce((sum, item) => sum + (item.total ?? 0), 0),
      hasUnpriced: items.some((item) => item.price == null),
      qtyOf,
      setQty,
      add: (id, size, qty = 1) => setQty(id, size, qtyOf(id, size) + qty),
      clear: () => setLines([]),
      open,
      setOpen,
    };
  }, [lines, open, setQty]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
