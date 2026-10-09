import { gsap } from '../../../lib/gsap.js';
import { scrollLengths, packGrains } from '../storyData.js';

// Chapter 5: the husk splits open to reveal the rice grain, then floods to white.
export function animatePurity({ q, qa, pin }) {
  const halfLeft = q('.purity__half--l');
  const halfRight = q('.purity__half--r');
  const grain = q('.purity__grain');
  const glow = q('.purity__glow');
  const copy = q('.ch--purity .ch__copy');
  const chaff = qa('.purity__chaff');
  gsap
    .timeline({ defaults: { ease: 'none' }, scrollTrigger: pin('.ch--purity', scrollLengths.purity) })
    .from(copy, { opacity: 0, y: 30, duration: 0.22, ease: 'power2.out' }, 0)
    .to(halfLeft, { xPercent: -34, rotate: -13, duration: 0.5, ease: 'power2.inOut' }, 0.12)
    .to(halfRight, { xPercent: 34, rotate: 13, duration: 0.5, ease: 'power2.inOut' }, 0.12)
    .fromTo(
      grain,
      { scale: 0.86, opacity: 0.6 },
      { scale: 1.06, opacity: 1, duration: 0.42, ease: 'power2.out' },
      0.2,
    )
    .fromTo(glow, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1.25, duration: 0.45 }, 0.22)
    .to(
      chaff,
      {
        xPercent: (i) => (i % 2 ? 1 : -1) * (60 + i * 26),
        yPercent: (i) => -40 - i * 18,
        rotate: (i) => (i % 2 ? 1 : -1) * (40 + i * 25),
        opacity: 0,
        duration: 0.5,
        ease: 'power1.out',
      },
      0.24,
    )
    .to(grain, { scale: 2.9, duration: 0.26, ease: 'power2.in' }, 0.74)
    .to([halfLeft, halfRight, copy, glow], { opacity: 0, duration: 0.16 }, 0.76)
    .to(q('.ch--purity .ch__mask'), { opacity: 1, duration: 0.2 }, 0.8);
}

// Chapter 6: grains pour down, then the three bags arrive.
export function animatePack({ q, qa, pin }) {
  const grains = qa('.pack__grain');
  const bagLeft = q('.pack__bag--l');
  const bagMid = q('.pack__bag--m');
  const bagRight = q('.pack__bag--r');
  const copy = q('.ch--pack .ch__copy');
  const tag = q('.pack__tag');
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: pin('.ch--pack', scrollLengths.pack),
  });
  tl.from(copy, { opacity: 0, y: 28, duration: 0.16, ease: 'power2.out' }, 0);
  grains.forEach((el, i) => {
    const g = packGrains[i];
    tl.fromTo(
      el,
      { yPercent: -260, opacity: 0, rotate: g.rot, xPercent: g.x },
      {
        yPercent: 40,
        opacity: 1,
        rotate: g.rot + 150,
        xPercent: g.x * 0.25,
        duration: 0.26,
        ease: 'power1.in',
      },
      0.06 + g.delay * 0.5,
    ).to(el, { opacity: 0, duration: 0.05 }, 0.06 + g.delay * 0.5 + 0.24);
  });
  tl.fromTo(
    bagLeft,
    { opacity: 0, scale: 0.9, yPercent: 8 },
    { opacity: 1, scale: 1, yPercent: 0, duration: 0.2, ease: 'back.out(1.4)' },
    0.42,
  )
    .fromTo(
      bagMid,
      { opacity: 0, xPercent: 120, yPercent: 6 },
      { opacity: 1, xPercent: 0, yPercent: 0, duration: 0.24, ease: 'power3.out' },
      0.56,
    )
    .fromTo(
      bagRight,
      { opacity: 0, xPercent: -120, yPercent: 6 },
      { opacity: 1, xPercent: 0, yPercent: 0, duration: 0.24, ease: 'power3.out' },
      0.62,
    )
    .to([bagLeft, bagMid, bagRight], { yPercent: -2, duration: 0.1, ease: 'sine.inOut' }, 0.86)
    .fromTo(
      tag,
      { opacity: 0, y: 26 },
      { opacity: 1, y: 0, duration: 0.14, ease: 'power2.out' },
      0.84,
    );
}
