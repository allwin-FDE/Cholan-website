import { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap.js';
import { prefersReducedMotion } from '../../lib/motion.js';

// How many viewport heights of scrolling the fill takes.
const SCROLL_SCREENS = 1.6;

const headerHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 74;

// Home "the river returns" section: a Kallanai-style dam that fills as you scroll.
//
// Four painted layers sit on top of each other. The dam is dry at the start;
// scrolling drives one timeline that pours the falls down the face, raises the
// river behind them and settles the rocks in front. It is scrubbed, so
// scrolling back up drains the dam again.
export default function DamSection() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Reduced motion: show the dam already full and skip the scroll work.
    if (prefersReducedMotion()) {
      root.classList.add('dam--static');
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: () => `top top+=${headerHeight()}`,
          end: () => `+=${window.innerHeight * SCROLL_SCREENS}`,
          pin: '.dam__stage',
          scrub: 1.1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // The falls are uncovered from the crest downward, which reads as water
      // spilling over the edge and reaching for the river. Clipping keeps the
      // artwork undistorted; the image's own soft foot does the tapering.
      tl.fromTo(
        '.dam__falls-wrap',
        { clipPath: 'inset(0 0 100% 0)' },
        { clipPath: 'inset(0 0 0% 0)', duration: 1, ease: 'power1.out' },
        0,
      )
        // The river rises to meet the falling water. It starts early so the
        // base of the falls always lands in water, never on dry sand.
        .fromTo(
          '.dam__river',
          { autoAlpha: 0, yPercent: 14 },
          { autoAlpha: 1, yPercent: 0, duration: 0.75 },
          0.1,
        )
        // Spray at the base of the falls blooms once there is water to throw.
        .fromTo('.dam__spray', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 0.55)
        // Foreground rocks drift up slightly, a parallax against the water.
        .fromTo('.dam__rocks', { yPercent: 10 }, { yPercent: 0, duration: 1 }, 0)
        // Copy arrives once the dam is visibly running.
        .fromTo(
          '.dam__copy > *',
          { autoAlpha: 0, y: 24 },
          { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.08, ease: 'power2.out' },
          0.6,
        );
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section className="dam" ref={rootRef} aria-labelledby="dam-title">
      <div className="dam__stage">
        <div className="dam__sky" aria-hidden="true" />

        <img className="dam__layer dam__dam" src="/images/dam/dam.webp" alt="" aria-hidden="true" />

        <div className="dam__falls-wrap" aria-hidden="true">
          <img className="dam__layer dam__falls" src="/images/dam/falls.webp" alt="" />
        </div>

        <img
          className="dam__layer dam__river"
          src="/images/dam/river.webp"
          alt=""
          aria-hidden="true"
        />

        <div className="dam__spray" aria-hidden="true" />

        <img
          className="dam__layer dam__rocks"
          src="/images/dam/rocks.webp"
          alt=""
          aria-hidden="true"
        />

        <div className="dam__copy">
          <h2 className="dam__title" id="dam-title">
            Fed by the Kaveri
          </h2>
          <p className="dam__lede">
            The same waters the Cholas dammed at Kallanai still run through the delta, and
            through every grain we mill.
          </p>
        </div>
      </div>
    </section>
  );
}
