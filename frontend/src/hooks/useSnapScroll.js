import { useEffect } from 'react';
import { gsap } from '../lib/gsap.js';

// Module-level: the in-flight snap tween, so wheel/touch/keys are swallowed while it runs.
let activeSnap = null;

const getHeaderHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 74;

// Page scroll offset that puts `el` just below the sticky header (original `Qd`).
export const getSectionTop = (el) =>
  Math.round(el.getBoundingClientRect().top + window.scrollY - getHeaderHeight());

// Full-page "snap" scrolling used by the home sections (original `$d`).
// `resolveTarget(direction, scrollY)` gets +1 (down) / -1 (up) and the current scrollY and returns
// the scrollTop to animate to, or null/same position to let native scrolling continue.
// Handles wheel, touch swipes and keyboard (arrows, PageUp/Down, Space). `ref` just gates
// the effect until the section is mounted.
export function useSnapScroll(ref, resolveTarget) {
  useEffect(() => {
    if (!ref.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let touchStartY = null;

    const animateTo = (top) => {
      const state = { y: window.scrollY };
      activeSnap = gsap.to(state, {
        y: top,
        duration: reduced ? 0 : 1.1,
        ease: 'power3.out',
        onUpdate: () => window.scrollTo({ top: state.y, behavior: 'instant' }),
        onComplete: () => setTimeout(() => (activeSnap = null), 150),
      });
    };
    const trySnap = (direction) => {
      const top = resolveTarget(direction, window.scrollY);
      return top == null || Math.abs(top - window.scrollY) < 2 ? false : (animateTo(Math.max(0, top)), true);
    };

    const onWheel = (e) => {
      if (activeSnap) {
        e.preventDefault();
        return;
      }
      !e.ctrlKey && e.deltaY && trySnap(e.deltaY > 0 ? 1 : -1) && e.preventDefault();
    };
    const onTouchStart = (e) => {
      touchStartY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e) => {
      if (activeSnap) {
        e.cancelable && e.preventDefault();
        return;
      }
      if (touchStartY == null) return;
      const delta = touchStartY - e.touches[0].clientY;
      if (Math.abs(delta) < 8) return;
      touchStartY = null;
      trySnap(delta > 0 ? 1 : -1) && e.cancelable && e.preventDefault();
    };
    const onKeyDown = (e) => {
      if (activeSnap || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const down = ['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
      const up = ['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
      (down || up) && trySnap(down ? 1 : -1) && e.preventDefault();
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);
    };
    // Original behaviour: bound once on mount; resolveTarget is read from the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
