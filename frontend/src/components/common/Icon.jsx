// Small inline SVG icon from a path string (original `or`); `fill` toggles solid vs outline.
export function Icon({ d, fill }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={d}
        fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Path data for the footer icons (original `sr`).
export const iconPaths = {
  phone:
    'M5 4h3.5l1.5 4.5-2 1.5a11 11 0 0 0 6 6l1.5-2L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v7h4v-7h3l1-4h-4V8.5a.5.5 0 0 1 .5-.5Z',
  instagram:
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 13.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM17.5 6.5h.01',
  linkedin:
    'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM8 10.5V17M8 7.5v.01M12 17v-6.5M12 13.5a2.5 2.5 0 0 1 5 0V17',
};

// Path data for the "Why millets" benefit cards. Drawn as outlines on the same
// 24x24 grid as iconPaths, so they take the same stroke treatment.
export const milletIcons = {
  // An ear of grain: a stalk with husks fanning off it, bran and germ intact.
  grain:
    'M12 21V9M12 9c0-2.6 1.6-4.5 4-4.5 0 2.6-1.6 4.5-4 4.5Zm0 0c0-2.6-1.6-4.5-4-4.5 0 2.6 1.6 4.5 4 4.5Zm0 5.5c0-2.4 1.5-4 3.6-4 0 2.4-1.5 4-3.6 4Zm0 0c0-2.4-1.5-4-3.6-4 0 2.4 1.5 4 3.6 4Z',
  // A leaf with its midrib: fibre, the plant kept whole.
  leaf: 'M19.5 4.5C10 4.5 4.5 9.2 4.5 15.5a4 4 0 0 0 4 4c6.3 0 11-5.5 11-15ZM6 18 13.5 10.5',
  // A shield with a tick: free of gluten, naturally.
  shield: 'M12 3.2 19 6v5.4c0 4.1-2.8 7.7-7 9.4-4.2-1.7-7-5.3-7-9.4V6l7-2.8ZM9.2 11.8l2 2 3.6-3.6',
  // A steady trace rather than a spike: slow, even energy.
  pulse: 'M3 14.5h3.6l2.1-5.2 2.9 8.4 2.5-5.6 1.4 2.4H21',
};
