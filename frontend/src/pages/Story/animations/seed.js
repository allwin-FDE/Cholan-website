import { gsap } from '../../../lib/gsap.js';
import { scrollLengths } from '../storyData.js';

// Chapter 4: seed -> sprout -> stalk, with three text beats and a side rail.
export function animateSeed({ q, qa, pin }) {
  const husk = q('.seed__husk');
  const sprout = q('.seed__sprout');
  const stalk = q('.seed__stalk');
  const beats = qa('.seed__beat');
  const marks = qa('.seed__mark');
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: pin('.ch--seed', scrollLengths.seed),
  });
  tl.fromTo(
    husk,
    { yPercent: -120, xPercent: 17, rotate: -22, opacity: 0 },
    {
      yPercent: 0,
      xPercent: 17,
      rotate: 8,
      opacity: 1,
      duration: 0.2,
      ease: 'power2.out',
    },
    0,
  )
    .to(husk, { rotate: 0, duration: 0.12, ease: 'sine.out' }, 0.2)
    .to(husk, { scale: 0.92, xPercent: 0, yPercent: 6, duration: 0.16, ease: 'sine.inOut' }, 0.33)
    .fromTo(
      sprout,
      { scaleY: 0, opacity: 1, transformOrigin: '50% 92%' },
      { scaleY: 1, duration: 0.2, ease: 'power2.out' },
      0.35,
    )
    .fromTo(
      '.seed__leaf',
      { scaleY: 0.2, scaleX: 0.6, opacity: 0 },
      {
        scaleY: 1,
        scaleX: 1,
        opacity: 1,
        duration: 0.16,
        stagger: 0.04,
        ease: 'power2.out',
      },
      0.44,
    )
    .to([husk, sprout], { opacity: 0, scale: 0.8, duration: 0.14, ease: 'sine.in' }, 0.64)
    .fromTo(
      stalk,
      { opacity: 0, scale: 0.8, yPercent: 8 },
      { opacity: 1, scale: 1, yPercent: 0, duration: 0.16, ease: 'sine.out' },
      0.66,
    )
    .fromTo(stalk, { rotate: -3 }, { rotate: 5, duration: 0.2, ease: 'sine.inOut' }, 0.8);
  const beatStarts = [0, 0.35, 0.66];
  beats.forEach((beat, i) => {
    const start = beatStarts[i];
    const nextStart = beatStarts[i + 1];
    tl.set(beat, { visibility: 'visible' }, start).fromTo(
      beat,
      { opacity: 0, y: 22 },
      { opacity: 1, y: 0, duration: 0.09, ease: 'power2.out' },
      start,
    );
    nextStart !== void 0 &&
      tl
        .to(beat, { opacity: 0, y: -18, duration: 0.07, ease: 'power2.in' }, nextStart - 0.07)
        .set(beat, { visibility: 'hidden' }, nextStart);
  });
  marks.forEach((mark, i) => {
    tl.to(mark, { opacity: 1, duration: 0.05 }, beatStarts[i]);
    beatStarts[i + 1] !== void 0 && tl.to(mark, { opacity: 0.28, duration: 0.05 }, beatStarts[i + 1]);
  });
}
