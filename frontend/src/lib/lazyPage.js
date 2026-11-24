import { lazy } from 'react';

// A page loaded as its own file, so the first visit doesn't download every
// page's code. `preload()` fetches it ahead of time; once fetched, the page
// renders straight away with no loading gap (the lazy factory then hands
// React the module synchronously). main.jsx preloads the page being opened
// before the app starts, so a saved (prerendered) page never flashes blank.
export function lazyPage(load, pick = (m) => m.default) {
  let mod = null;
  let pending = null;
  const preload = () => (pending ||= load().then((m) => (mod = { default: pick(m) })));
  const Page = lazy(() => (mod ? { then: (resolve) => resolve(mod) } : preload().then(() => mod)));
  Page.preload = preload;
  return Page;
}
