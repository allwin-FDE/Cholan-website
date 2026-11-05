import { createContext, useContext } from 'react';

// Who is signed in, their role, and the chosen period, for every dashboard page.
export const DashContext = createContext(null);
export const useDash = () => useContext(DashContext);

const RANK = { poster: 0, viewer: 1, editor: 2, admin: 3, owner: 4 };
export const can = (role, needed) => RANK[role] >= RANK[needed];

export const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];
