import { useEffect } from 'react';
import { gsap } from '../lib/gsap.js';

// Module-level: the in-flight snap tween, so wheel/touch/keys are swallowed while it runs.
let activeSnap = null;
// After a snap, the rest of the gesture that caused it (a trackpad's momentum,
// a still-spinning wheel) is absorbed — but only that gesture, and a new one
// scrolls straight away. An event belongs to the same gesture when it follows
// close on the last, or when it is weaker than the last (or a tiny tail step)
// within a longer window: momentum fades, while a mouse wheel turned again
// sends the same step as before, and must scroll.
let settling = false;
let lastWheelAt = 0;
let lastWheelSize = 0;
const GESTURE_GAP_MS = 90;
const FADE_WINDOW_MS = 300;

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

    // Short and decisive: moving the instant the wheel turns and arriving
    // without a long crawl at the end, which read as the page sticking.
    const animateTo = (top) => {
      const state = { y: window.scrollY };
      activeSnap = gsap.to(state, {
        y: top,
        duration: reduced ? 0 : 0.7,
        ease: 'power2.out',
        onUpdate: () => window.scrollTo({ top: state.y, behavior: 'instant' }),
        onComplete: () => {
          activeSnap = null;
          settling = true;
        },
      });
    };
    const trySnap = (direction) => {
      const top = resolveTarget(direction, window.scrollY);
      return top == null || Math.abs(top - window.scrollY) < 2 ? false : (animateTo(Math.max(0, top)), true);
    };

    const onWheel = (e) => {
      const now = performance.now();
      const gap = now - lastWheelAt;
      const size = Math.abs(e.deltaY);
      const sameGesture =
        gap < GESTURE_GAP_MS ||
        (gap < FADE_WINDOW_MS && (size < lastWheelSize || size <= 4));
      lastWheelAt = now;
      lastWheelSize = size;
      if (activeSnap || (settling && sameGesture)) {
        e.preventDefault();
        return;
      }
      settling = false;
      !e.ctrlKey && e.deltaY && trySnap(e.deltaY > 0 ? 1 : -1) && e.preventDefault();
    };
    const onTouchStart = (e) => {
      touchStartY = e.touches[0]?.clientY ?? null;
      settling = false; // a new touch is always a new gesture
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
      settling = false;
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
