import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// A view's settings live in its address, for example
// /admin/business/purchases?tab=bills&bill=12: Back and Forward step through
// them, a refresh keeps them, and a copied link opens the same view.
//
// patch({ key: value }) changes several keys in one step (an empty value
// removes the key). Call it once per click: two calls in the same click would
// overwrite each other.
export function useUrl() {
  const [params, setParams] = useSearchParams();
  const patch = useCallback(
    (changes, { replace = false } = {}) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value == null || value === '' || value === false) next.delete(key);
            else next.set(key, String(value));
          }
          return next;
        },
        { replace },
      ),
    [setParams],
  );
  const get = (key, fallback = '') => params.get(key) ?? fallback;
  // A record's number from the address, or null.
  const id = (key) => (/^\d+$/.test(params.get(key) || '') ? Number(params.get(key)) : null);
  return { params, patch, get, id };
}

// A search box kept in the address. Typing updates the box at once and the
// address a moment later (replacing the entry, so Back doesn't step through
// every letter). Returns [text in the box, setText, the search in the address].
export function useUrlSearch(key = 'q', delay = 300) {
  const { get, patch } = useUrl();
  const committed = get(key);
  const [text, setText] = useState(committed);
  // The latest patch and address, so the delayed update doesn't undo a
  // filter changed while typing.
  const latest = useRef({ patch, committed });
  latest.current = { patch, committed };
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== latest.current.committed) latest.current.patch({ [key]: text.trim() }, { replace: true });
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  // Back or Forward changed the address: show its search in the box.
  useEffect(() => {
    setText((t) => (t.trim() === committed ? t : committed));
  }, [committed]);
  return [text, setText, committed];
}
