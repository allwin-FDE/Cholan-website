import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getSectionTop } from '../../hooks/useSnapScroll.js';

// Scrolls to the top on every navigation (original `ur`). Renders nothing.
// A link to a section (/#reviews, as the chat's sources use) scrolls to that
// section instead: smoothly when already on the page, and from the top once
// a new page has settled, since its pinned sections and the page wipe change
// the layout for a moment after the route changes.
export default function ScrollToTop() {
  const { key, pathname, hash } = useLocation();
  const lastPath = useRef(pathname);

  useLayoutEffect(() => {
    const samePage = lastPath.current === pathname;
    lastPath.current = pathname;
    if (!hash || !samePage) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (!hash) return undefined;

    // A page still loading (first visit: images, pinned sections measuring
    // themselves) can reset the scroll mid-way, so check once it has had time
    // to arrive and go again if the section is not in view.
    let tries = 0;
    let checks = 0;
    let timer;
    const go = () => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!el) {
        if ((tries += 1) < 20) timer = setTimeout(go, 100);
        return;
      }
      if (Math.abs(getSectionTop(el) - window.scrollY) < 40) return;
      window.scrollTo({ top: getSectionTop(el), behavior: 'smooth' });
      if ((checks += 1) < 3) timer = setTimeout(go, 1500);
    };
    timer = setTimeout(go, samePage ? 0 : 700);
    return () => clearTimeout(timer);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
