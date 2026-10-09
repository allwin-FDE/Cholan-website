import { useEffect, useRef, useState } from 'react';
import { gsap } from '../../lib/gsap.js';

const TILT_TARGETS = '.card, .cattile, .quote, .infocard, .feature'; // 3D tilt on hover
const MAGNET_TARGETS = '.btn, .card__details, .ab-btn, .chip, .cart-btn'; // buttons pulled toward the cursor
const GRAIN_TRIGGERS = "a, button, .chip, select, label[for], [role='button']"; // click -> rice-grain burst
const OWN_INTERACTION = '.curtain, .rs'; // sections that handle their own pointer effects
const GRAIN_COLORS = ['#e8bb56', '#d29b2c', '#f6ebcf', '#fffdf5', '#b07d1d'];

// Global pointer/scroll effects (original `qd`): click grain burst, magnetic buttons,
// card tilt (fine pointers only; skipped for reduced motion) and the back-to-top button
// with a scroll-progress ring. Rendered once in the app shell.
export default function InteractionFx() {
  const [showTop, setShowTop] = useState(false);
  const ringRef = useRef(null);

  // Pointer effects.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cleanups = [];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };

    const grains = document.createElement('div');
    grains.className = 'fx-grains';
    grains.setAttribute('aria-hidden', 'true');
    document.body.appendChild(grains);
    cleanups.push(() => grains.remove());

    if (!reduced) {
      listen(document, 'pointerdown', (e) => {
        const trigger = e.target.closest(GRAIN_TRIGGERS);
        if (!trigger || trigger.closest(OWN_INTERACTION) || trigger.matches('input, textarea')) return;
        for (let i = 0; i < 10; i++) {
          const grain = document.createElement('span');
          grain.className = 'fx-grain';
          grain.style.background = GRAIN_COLORS[i % GRAIN_COLORS.length];
          grains.appendChild(grain);
          const angle = (Math.PI * 2 * i) / 10 + gsap.utils.random(-0.3, 0.3);
          const distance = gsap.utils.random(28, 64);
          gsap.set(grain, {
            x: e.clientX,
            y: e.clientY,
            rotate: (angle * 180) / Math.PI + 90,
            scale: gsap.utils.random(0.7, 1.2),
          });
          gsap
            .timeline({ onComplete: () => grain.remove() })
            .to(grain, {
              x: `+=${Math.cos(angle) * distance}`,
              y: `+=${Math.sin(angle) * distance}`,
              duration: 0.45,
              ease: 'power3.out',
            })
            .to(
              grain,
              { y: '+=26', rotate: '+=120', autoAlpha: 0, duration: 0.45, ease: 'power1.in' },
              0.3,
            );
        }
      });
    }

    if (!finePointer || reduced) return () => cleanups.forEach((fn) => fn());

    let tiltEl = null;
    let tiltFrame = 0;
    const clearTilt = () => {
      if (tiltEl) {
        tiltEl.classList.remove('fx-tilt');
        tiltEl.style.removeProperty('--rx');
        tiltEl.style.removeProperty('--ry');
        tiltEl = null;
      }
    };
    const quickTos = new WeakMap();
    let magnetEl = null;
    const getQuickTo = (el) => {
      if (!quickTos.has(el)) {
        quickTos.set(el, {
          x: gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' }),
          y: gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' }),
        });
      }
      return quickTos.get(el);
    };
    const releaseMagnet = () => {
      if (!magnetEl) return;
      const el = magnetEl;
      magnetEl = null;
      gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)', clearProps: 'transform' });
    };

    listen(document, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const { clientX, clientY, target } = e;
      const ownInteraction = target.closest?.(OWN_INTERACTION);
      const magnet = ownInteraction ? null : target.closest(MAGNET_TARGETS);
      if (magnet !== magnetEl) releaseMagnet();
      if (magnet) {
        magnetEl = magnet;
        const rect = magnet.getBoundingClientRect();
        const currentX = gsap.getProperty(magnet, 'x');
        const currentY = gsap.getProperty(magnet, 'y');
        const move = getQuickTo(magnet);
        move.x((clientX - (rect.left - currentX + rect.width / 2)) * 0.28);
        move.y((clientY - (rect.top - currentY + rect.height / 2)) * 0.36);
      }
      const tilt = ownInteraction ? null : target.closest(TILT_TARGETS);
      if (tilt !== tiltEl) clearTilt();
      if (tilt) {
        tiltEl = tilt;
        cancelAnimationFrame(tiltFrame);
        tiltFrame = requestAnimationFrame(() => {
          if (tiltEl !== tilt) return;
          const rect = tilt.getBoundingClientRect();
          const px = (clientX - rect.left) / rect.width;
          const py = (clientY - rect.top) / rect.height;
          tilt.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
          tilt.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
          tilt.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
          tilt.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
          tilt.classList.add('fx-tilt');
        });
      }
    });
    listen(document, 'pointerleave', () => {
      clearTilt();
      releaseMagnet();
    });
    listen(
      window,
      'scroll',
      () => {
        clearTilt();
      },
      { passive: true },
    );
    document.documentElement.classList.add('fx-fine');
    cleanups.push(() => document.documentElement.classList.remove('fx-fine'));
    return () => {
      cancelAnimationFrame(tiltFrame);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  // Back-to-top visibility + scroll progress ring.
  useEffect(() => {
    const ring = ringRef.current;
    let frame = 0;
    const update = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
      setShowTop(window.scrollY > window.innerHeight * 0.9);
      if (ring) ring.style.strokeDashoffset = String(1 - progress);
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <button
      type="button"
      className={`fx-top${showTop ? ' fx-top--on' : ''}`}
      aria-label="Back to top"
      tabIndex={showTop ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="fx-top__track" cx="24" cy="24" r="21" />
        <circle ref={ringRef} className="fx-top__ring" cx="24" cy="24" r="21" pathLength="1" />
        <path className="fx-top__arrow" d="M24 31V17m-6 6 6-6 6 6" />
      </svg>
    </button>
  );
}
