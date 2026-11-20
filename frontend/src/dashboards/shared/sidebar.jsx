import { useCallback, useState } from 'react';

// The arrow on the menu's edge that slides the menu away for more room, and
// brings it back. The choice is remembered on this device. On phones the
// menu already opens from the top bar, so the arrow isn't shown there.
const KEY = 'cholan-side-hidden';

export function useSideHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(
    () =>
      setHidden((h) => {
        try {
          localStorage.setItem(KEY, h ? '0' : '1');
        } catch {
          // Private mode: the choice holds for this visit only.
        }
        return !h;
      }),
    [],
  );
  return [hidden, toggle];
}

export function SideToggle({ hidden, onToggle }) {
  const label = hidden ? 'Show the menu' : 'Hide the menu';
  return (
    <button type="button" className="dash-sidetoggle" onClick={onToggle} aria-label={label} aria-expanded={!hidden} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
