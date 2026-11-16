import { createContext, useContext } from 'react';

// Who is signed in, their role, and the chosen period, for every admin page.
export const DashContext = createContext(null);
export const useDash = () => useContext(DashContext);

const RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const can = (role, needed) => RANK[role] >= RANK[needed];

// A period is a number of days back from now, or a range of whole days
// written "2026-11-13_2026-11-16" (the /warehouse Custom option).
export const isRange = (period) => typeof period === 'string' && /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(period);

// The query string the backend reads (routes/admin.js period()).
export function periodQuery(period) {
  if (!isRange(period)) return { days: String(period) };
  const [from, to] = period.split('_');
  return { from, to };
}

// Start and end of the period in milliseconds, for filtering in the page.
export function periodBounds(period) {
  if (!isRange(period)) return { from: Date.now() - Number(period) * 86_400_000, to: Infinity };
  const [from, to] = period.split('_');
  return { from: Date.parse(`${from}T00:00:00+05:30`), to: Date.parse(`${to}T23:59:59.999+05:30`) };
}

// For file names: "30d" or "2026-11-13_to_2026-11-16".
export const periodName = (period) => (isRange(period) ? period.replace('_', '_to_') : `${period}d`);

export const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];
