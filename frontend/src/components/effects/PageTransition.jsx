import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap, ScrollTrigger } from '../../lib/gsap.js';
import { prefersReducedMotion } from '../../lib/motion.js';

// Elements that get the scroll-in "reveal" (fade/slide up), staggered per batch.
const REVEAL_SELECTORS = [
  '.grid > *',
  '.products-grid > *',
  '.footer__top > *',
  '.footer__grid > *',
  '.contact > *',
  '.infocard',
  '.policy__block',
  '.pdp__info > *',
  '.filters',
  '.results-count',
  '.bulk > *',
  '.millets__item',
  '.feature',
  '.newsletter',
  '.section-head-row > .btn',
  '.center > .row',
  '.marquee',
];

// Sections with their own bespoke animation: excluded from the generic reveals.
const OWN_ANIMATION = '.ab, .curtain, .rs, .dam';

// Route-change wipe curtain (gold/green/cream panels + logo) AND the generic scroll
// reveals for headings, grids and images (original `Vd`). Dispatches `fx:reveal` on
// window when the wipe has opened, which page animations listen for.
export default function PageTransition() {
  const { pathname } = useLocation();
  const wipeRef = useRef(null);
  const firstLoadRef = useRef(true);
  const homeViaLogoRef = useRef(false); // set when the logo is clicked from another page
  const timelineRef = useRef(null);
  const lastPathRef = useRef(null);

  // Play the "open" wipe. withLogo=true shows the logo mark first (initial load / logo click).
  const playWipe = (withLogo, hold = 0.35) => {
    const root = wipeRef.current;
    const cream = root.querySelector('.fx-wipe__panel--cream');
    const mark = root.querySelector('.fx-wipe__mark');
    const panels = Array.from(root.querySelectorAll('.fx-wipe__panel')).reverse();
    timelineRef.current?.kill();
    const tl = gsap.timeline({ onComplete: () => gsap.set(root, { autoAlpha: 0 }) });
    tl.set(root, { autoAlpha: 1 }).set(panels, { yPercent: 0 });
    if (withLogo) {
      tl.fromTo(
        mark,
        { autoAlpha: 0, y: 0, scale: 0.85 },
        { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'power2.out' },
      )
        .to(mark, { autoAlpha: 0, y: -20, duration: 0.25, ease: 'power2.in' }, 0.45 + hold)
        .to(
          panels,
          { yPercent: -100, duration: 0.75, stagger: 0.08, ease: 'power4.inOut' },
          0.55 + hold,
        );
    } else {
      tl.set(cream, { yPercent: -100 }).to(
        panels.filter((panel) => panel !== cream),
        { yPercent: -100, duration: 0.6, stagger: 0.07, ease: 'power4.inOut' },
        0.05,
      );
    }
    tl.call(() => window.dispatchEvent(new Event('fx:reveal')), null, withLogo ? 0.9 + hold : 0.3);
    timelineRef.current = tl;
    return tl;
  };

  // On each route change, run the wipe (or just signal reveal under reduced motion).
  useLayoutEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    if (!wipeRef.current || prefersReducedMotion()) {
      firstLoadRef.current = false;
      window.dispatchEvent(new Event('fx:reveal'));
      return;
    }
    const withLogo = firstLoadRef.current || homeViaLogoRef.current;
    const hold = firstLoadRef.current ? 0.6 : 0.35;
    firstLoadRef.current = false;
    homeViaLogoRef.current = false;
    playWipe(withLogo, hold);
  }, [pathname]);

  // Clicking the header logo: from another page, flag the next (home) navigation to show the
  // logo wipe; when already on home, cover the screen, scroll to top, then open the wipe.
  useEffect(() => {
    const onClick = (e) => {
      if (!e.target.closest('.header .brand') || prefersReducedMotion()) return;
      if (window.location.pathname !== '/') {
        homeViaLogoRef.current = true;
        return;
      }
      const root = wipeRef.current;
      const panels = Array.from(root.querySelectorAll('.fx-wipe__panel'));
      timelineRef.current?.kill();
      timelineRef.current = gsap
        .timeline()
        .set(root, { autoAlpha: 1 })
        .set(root.querySelector('.fx-wipe__mark'), { autoAlpha: 0 })
        .fromTo(
          panels,
          { yPercent: 100 },
          { yPercent: 0, duration: 0.6, stagger: 0.07, ease: 'power4.inOut' },
        )
        .add(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          playWipe(true);
        });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Scroll-triggered reveals, rebuilt per route.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const shell = document.querySelector('.app-shell');
    if (!shell) return;
    const ctx = gsap.context(() => {
      const isGeneric = (el) => !el.closest(OWN_ANIMATION);

      // Section headings / page heroes: eyebrow slides in, title unmasks, lede fades up.
      gsap.utils
        .toArray('.section-head, .pagehero .container', shell)
        .filter(isGeneric)
        .forEach((head) => {
          const eyebrow = head.querySelector('.eyebrow');
          const title = head.querySelector('h1, h2');
          const lede = head.querySelector('.lede');
          const tl = gsap.timeline({
            scrollTrigger: { trigger: head, start: 'top 88%', once: true },
            defaults: { ease: 'power3.out' },
          });
          if (eyebrow) tl.from(eyebrow, { autoAlpha: 0, x: -24, letterSpacing: '0.4em', duration: 0.8 }, 0);
          if (title)
            tl.fromTo(
              title,
              { clipPath: 'inset(0 0 100% 0)', y: 36 },
              { clipPath: 'inset(0 0 -20% 0)', y: 0, duration: 1, clearProps: 'clipPath' },
              0.08,
            );
          if (lede) tl.from(lede, { autoAlpha: 0, y: 20, duration: 0.8 }, 0.3);
        });

      // Grids, cards and misc blocks fade/slide up in batches.
      const revealTargets = gsap.utils.toArray(REVEAL_SELECTORS.join(','), shell).filter(isGeneric);
      gsap.set(revealTargets, { autoAlpha: 0, y: 46 });
      ScrollTrigger.batch(revealTargets, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            autoAlpha: 1,
            y: 0,
            duration: 0.9,
            stagger: 0.1,
            ease: 'power3.out',
            clearProps: 'transform',
          }),
      });

      // Category tile / product detail photos zoom out into place.
      gsap.utils
        .toArray('.cattile__media img, .pdp__photo', shell)
        .filter(isGeneric)
        .forEach((img) => {
          gsap.from(img, {
            scale: 1.25,
            duration: 1.4,
            ease: 'power2.out',
            clearProps: 'transform',
            scrollTrigger: { trigger: img, start: 'top 92%', once: true },
          });
        });

      // Product card images drop in with a bounce.
      gsap.utils
        .toArray('.card__media img', shell)
        .filter(isGeneric)
        .forEach((img) => {
          gsap.from(img, {
            y: -40,
            rotate: -6,
            duration: 1.1,
            ease: 'bounce.out',
            delay: 0.15,
            clearProps: 'transform',
            scrollTrigger: { trigger: img, start: 'top 90%', once: true },
          });
        });
    }, shell);
    const refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 400);
    return () => {
      clearTimeout(refreshTimer);
      ctx.revert();
    };
  }, [pathname]);

  return (
    <div className="fx-wipe" ref={wipeRef} aria-hidden="true">
      <div className="fx-wipe__panel fx-wipe__panel--gold" />
      <div className="fx-wipe__panel fx-wipe__panel--green" />
      <div className="fx-wipe__panel fx-wipe__panel--cream">
        <img className="fx-wipe__mark" src="/images/cholan-logo.png" alt="" />
      </div>
    </div>
  );
}
