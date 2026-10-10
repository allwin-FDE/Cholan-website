import { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap.js';
import { prefersReducedMotion } from '../../lib/motion.js';

const headerHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 74;

// Home "Fed by the Kaveri" section.
//
// One finished painting of the Kallanai dam. Scrolling runs a slow camera move
// over it: the scene drifts down while easing out of a push-in, with the copy
// lifting slightly against it.
export default function KallanaiSection() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: () => `top bottom-=${headerHeight()}`,
          end: 'bottom top',
          scrub: 0.8,
          invalidateOnRefresh: true,
        },
      });

      // The scene: a slow drift down with a gentle push in, like a locked-off
      // camera easing toward the dam.
      tl.fromTo(
        '.kallanai__img',
        { yPercent: -5, scale: 1.1 },
        { yPercent: 5, scale: 1.02, duration: 1 },
        0,
      )
        // The copy lifts very slightly against it, holding the frame together.
        .fromTo('.kallanai__copy', { yPercent: -4 }, { yPercent: 4, duration: 1 }, 0);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section className="kallanai" aria-labelledby="kallanai-title" ref={rootRef}>
      <div className="kallanai__frame">
        <img
          className="kallanai__img"
          src="/images/kallanai/kallanai.webp"
          alt="The Grand Anicut at Kallanai, water running over the full length of the dam"
          loading="lazy"
          decoding="async"
          width="1672"
          height="941"
        />

        {/* The water is painted into the scene, so it cannot simply be moved.
            These are copies of the same picture clipped to the two water bands
            — the falls at 55-75% of the frame, the river below them — and
            nudged continuously. Against the identical pixels underneath, that
            reads as water running rather than as the picture sliding. */}
        <div className="kallanai__water kallanai__water--falls" aria-hidden="true">
          <img src="/images/kallanai/kallanai.webp" alt="" />
        </div>
        <div className="kallanai__water kallanai__water--river" aria-hidden="true">
          <img src="/images/kallanai/kallanai.webp" alt="" />
        </div>

        <div className="kallanai__scrim" aria-hidden="true" />

        <div className="kallanai__copy">
          <h2 className="kallanai__title" id="kallanai-title">
            Fed by the Kaveri
          </h2>
          <p className="kallanai__lede">
            Eighteen centuries of the Grand Anicut turning this river onto the delta — and
            onto every grain we mill.
          </p>
        </div>
      </div>
    </section>
  );
}
