import { useEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap.js';
import { prefersReducedMotion } from '../../lib/motion.js';

// How many viewport heights of scrolling the section holds.
const SCROLL_SCREENS = 1.6;

// Two copies of the river sit side by side and slide as one, so the water can
// travel a full plate-width without ever showing an edge.
const RIVER_DRIFT = 50;

const headerHeight = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 74;

// Home "Fed by the Kaveri" section: the dam pours constantly, and the water on
// the ground below it moves as the page scrolls.
//
// The dam and its falls are a single painted plate, so they stay fixed. The
// river underneath is the moving part: scrolling drives it downstream, lifts
// its level and thickens the spray at the foot of the falls. It is scrubbed,
// so scrolling back up runs the water the other way.
export default function DamSection() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

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

      // The river runs downstream for the whole section. This is the motion
      // the scroll is really driving.
      // Both transforms go on the track, not on the window that clips it:
      // moving the window would drag its mask along with it.
      tl.fromTo(
        '.dam__river-track',
        { xPercent: 0, yPercent: 8 },
        { xPercent: -RIVER_DRIFT, yPercent: 0, duration: 1 },
        0,
      )
        // Spray at the foot of the falls thickens as the water builds.
        .fromTo('.dam__spray', { autoAlpha: 0.25 }, { autoAlpha: 1, duration: 0.6 }, 0.1)
        // Foreground rocks drift against the current.
        .fromTo('.dam__rocks', { yPercent: 8 }, { yPercent: 0, duration: 1 }, 0)
        .fromTo(
          '.dam__copy > *',
          { autoAlpha: 0, y: 24 },
          { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.08, ease: 'power2.out' },
          0.1,
        );
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section className="dam" ref={rootRef} aria-labelledby="dam-title">
      <div className="dam__stage">
        <div className="dam__sky" aria-hidden="true" />

        {/* The river sits behind the dam so the falls land in front of it. */}
        <div className="dam__river" aria-hidden="true">
          <div className="dam__river-track">
            <img className="dam__river-tile" src="/images/dam/river.webp" alt="" />
            <img className="dam__river-tile" src="/images/dam/river.webp" alt="" />
            <img className="dam__river-tile" src="/images/dam/river.webp" alt="" />
          </div>
        </div>

        <img
          className="dam__layer dam__damfalls"
          src="/images/dam/damfalls.webp"
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
