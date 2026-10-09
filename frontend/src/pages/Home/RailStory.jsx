import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '../../lib/gsap.js';

const SCROLL_SCREENS = 4; // original `rf`
const WHITE_IN_AT = 25; // original `af`
const WORLD_DURATION = 33; // original `of`

// Split a phrase into words wrapped for the slide-up reveal (original `sf`).
const splitWords = (text) =>
  text.split(' ').flatMap((word, i) => [
    i > 0 ? ' ' : null,
    <span key={i} className="rs__word">
      <span>{word}</span>
    </span>,
  ]);

// Home "by rail" pinned scroll story (original `cf`).
export default function RailStory() {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('rs--static');
      return;
    }
    const world = root.querySelector('.rs__world');
    const sky = root.querySelector('.rs__sky');
    const brand = root.querySelector('.rs__brand');
    const templePos = root.querySelector('.rs__temple-pos');
    const temple = root.querySelector('.rs__temple');
    const mobileQuery = window.matchMedia('(max-width: 800px)');
    const templeZoom = 1.06;

    // Fit the temple beside (desktop) or under (mobile) the brand text.
    const layoutTemple = () => {
      templePos.style.width = '';
      templePos.style.left = '';
      if (!temple.naturalWidth) return;
      const ratio = temple.naturalHeight / temple.naturalWidth;
      const skyHeight = sky.clientHeight;
      const naturalWidth = templePos.offsetWidth;
      if (mobileQuery.matches) {
        const width =
          (skyHeight * 0.97 - (brand.offsetTop + brand.offsetHeight) - 16) / (ratio * templeZoom);
        width < naturalWidth && (templePos.style.width = `${Math.max(0, width)}px`);
        return;
      }
      const brandRight = brand.offsetLeft + brand.offsetWidth;
      const room = sky.clientWidth * 0.97 - brandRight - 32;
      const byWidth = room / templeZoom;
      const byHeight = (skyHeight * 0.94) / (ratio * templeZoom);
      const width = Math.max(0, Math.min(naturalWidth, byWidth, byHeight));
      templePos.style.width = `${width}px`;
      templePos.style.left = `${brandRight + 32 + room / 2}px`;
    };

    const train = root.querySelector('.rs__train');
    const bridge = root.querySelector('.rs__bridge');
    let trainFactor = 0;
    const computeTrainFactor = () => {
      trainFactor =
        (100 - (100 - (world.offsetWidth ? (train.offsetWidth / world.offsetWidth) * 100 : 80)) / 2) /
        24;
    };
    const setTrainX = gsap.quickSetter(train, 'x', 'px');
    let worldWidth = 0;
    let lastTime = -1;
    const updateTrain = (time) => {
      time > 34 ||
        Math.abs(time - lastTime) < 1e-4 ||
        ((lastTime = time), setTrainX(((100 - trainFactor * time) / 100) * worldWidth));
    };

    const ctx = gsap.context(() => {
      const headerHeight = () =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 74;
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: () => `top top+=${headerHeight()}`,
          end: () => `+=${window.innerHeight * SCROLL_SCREENS}`,
          pin: '.rs__stage',
          scrub: 1.2,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onRefresh: () => {
            computeTrainFactor();
            layoutTemple();
            worldWidth = world.offsetWidth;
            lastTime = -1;
            updateTrain(tl.time());
          },
        },
        onUpdate: () => updateTrain(tl.time()),
      });
      tl.fromTo('.rs__fields', { xPercent: 1 }, { xPercent: -2, duration: WORLD_DURATION }, 0)
        .fromTo('.rs__bridge', { xPercent: 2 }, { xPercent: -3, duration: WORLD_DURATION }, 0)
        .fromTo(
          '.rs__board',
          { x: () => bridge.offsetWidth * 0.02 },
          { x: () => bridge.offsetWidth * -0.03, duration: WORLD_DURATION },
          0,
        )
        .fromTo('.rs__paddy', { xPercent: 3 }, { xPercent: -7, duration: WORLD_DURATION }, 0)
        .to('.rs__intro', { autoAlpha: 0, y: -24, duration: 8, ease: 'sine.in' }, 12);
      tl.fromTo(world, { scale: 1 }, { scale: 1.14, duration: 15, ease: 'sine.in' }, 18)
        .to('.rs__paddy', { yPercent: 30, duration: 15, ease: 'sine.in' }, 18)
        .fromTo(
          '.rs__white',
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 8, ease: 'sine.inOut' },
          WHITE_IN_AT,
        );
      const skyAt = WORLD_DURATION;
      tl.set('.rs__sky', { autoAlpha: 1 }, skyAt)
        .to('.rs__white', { autoAlpha: 0, duration: 8, ease: 'sine.out' }, skyAt)
        .fromTo(
          '.rs__clouds',
          { scale: 1.18 },
          { scale: 1, duration: 40, ease: 'power1.out' },
          skyAt,
        )
        .fromTo('.rs__clouds', { xPercent: 2 }, { xPercent: -3, duration: 48 }, skyAt)
        .fromTo(
          '.rs__temple',
          { yPercent: 55, scale: 0.94 },
          { yPercent: 0, scale: 1, duration: 22, ease: 'power2.out' },
          36,
        )
        .fromTo(
          '.rs__mist',
          { autoAlpha: 1, yPercent: 0 },
          { autoAlpha: 0.15, yPercent: 18, duration: 20, ease: 'sine.inOut' },
          42,
        )
        .fromTo(
          '.rs__brand-title .rs__word > span',
          { yPercent: 140 },
          { yPercent: 0, duration: 6, stagger: 0.8, ease: 'power3.out' },
          42,
        )
        .fromTo(
          '.rs__brand-rule',
          { scaleX: 0 },
          { scaleX: 1, duration: 6, ease: 'power2.inOut' },
          47,
        )
        .fromTo(
          '.rs__brand-lede',
          { autoAlpha: 0, y: 14 },
          { autoAlpha: 1, y: 0, duration: 5, ease: 'power2.out' },
          48,
        )
        .to('.rs__temple', { scale: templeZoom, duration: 8 }, 55);
      tl.fromTo('.rs__progress-fill', { scaleX: 0 }, { scaleX: 1, duration: tl.duration() }, 0);
      computeTrainFactor();
      layoutTemple();
      worldWidth = world.offsetWidth;
      updateTrain(0);
      const images = Array.from(root.querySelectorAll('img'));
      Promise.all(
        images.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})),
      ).then(() => requestAnimationFrame(() => ScrollTrigger.refresh()));
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section className="rs" ref={ref} aria-label="From our farms to your home, by rail">
      <div className="rs__stage">
        <div className="rs__frame">
          <div className="rs__world">
            <img
              className="rs__layer rs__fields"
              src="/images/rail/fields.webp"
              alt=""
              decoding="async"
            />
            <img
              className="rs__layer rs__bridge"
              src="/images/rail/bridge.webp"
              alt=""
              decoding="async"
            />
            <img
              className="rs__layer rs__board"
              src="/images/rail/cholan-board.webp"
              alt="Cholan station nameboard"
              decoding="async"
            />
            <img
              className="rs__layer rs__train"
              src="/images/rail/full-train6.webp"
              alt="A passenger train crossing the bridge over the paddy fields"
              decoding="async"
            />
            <img
              className="rs__layer rs__paddy"
              src="/images/rail/paddy.webp"
              alt=""
              decoding="async"
            />
          </div>
        </div>
        <div className="rs__intro">
          <h2 className="rs__title">Travels through a journey of care and quality.</h2>
        </div>
        <div className="rs__sky">
          <img className="rs__clouds" src="/images/rail/clouds.webp" alt="" decoding="async" />
          <div className="rs__temple-pos">
            <img
              className="rs__temple"
              src="/images/rail/temple-cut.webp"
              alt="The Brihadeeswarar temple rising through the clouds"
              decoding="async"
            />
          </div>
          <div className="rs__mist" aria-hidden="true" />
          <div className="rs__ground" aria-hidden="true" />
          <div className="rs__brand">
            <h2 className="rs__brand-title">
              <span className="rs__line">{splitWords('Rooted in the')}</span>
              <span className="rs__line">{splitWords('timeless legacy of')}</span>
              <span className="rs__line">{splitWords('the Chola land.')}</span>
            </h2>
            <span className="rs__brand-rule" aria-hidden="true" />
            <p className="rs__brand-lede">
              Ponni and native paddy from the Cauvery delta, milled and packed for your kitchen.
            </p>
          </div>
        </div>
        <div className="rs__white" aria-hidden="true" />
        <div className="rs__progress" aria-hidden="true">
          <span className="rs__progress-fill" />
        </div>
      </div>
    </section>
  );
}
