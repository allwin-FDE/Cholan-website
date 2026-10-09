import { gsap } from '../../../lib/gsap.js';
import { scrollLengths, templeDoorway, fieldMotes } from '../storyData.js';

// Chapter 1: zoom through the temple doorway into the light.
export function animateTemple({ q, pin }) {
  const plate = q('.temple__plate');
  const glow = q('.temple__glow');
  const copy = q('.temple__copy');
  const warm = q('.temple__warm');
  const mask = q('.ch--temple .ch__mask');
  gsap.set(plate, { transformOrigin: `${templeDoorway.x}% ${templeDoorway.y}%` });
  gsap
    .timeline({ defaults: { ease: 'none' }, scrollTrigger: pin('.ch--temple', scrollLengths.temple) })
    .to(plate, { scale: 2.4, duration: 0.72, ease: 'power1.in' }, 0)
    .to(copy, { yPercent: -26, opacity: 0, duration: 0.3 }, 0)
    .to(glow, { opacity: 1, scale: 1.5, duration: 0.6 }, 0)
    .to(warm, { opacity: 1, duration: 0.55 }, 0.05)
    .fromTo(mask, { '--r': '0vmax' }, { '--r': '150vmax', duration: 0.34, ease: 'power2.in' }, 0.66);
}

// Chapter 2: the king walks toward the temple.
export function animateKing({ q, pin }) {
  const fig = q('.king__fig');
  const cape = q('.king__cape');
  const copy = q('.ch--king .ch__copy');
  const haze = q('.king__haze');
  gsap
    .timeline({ defaults: { ease: 'none' }, scrollTrigger: pin('.ch--king', scrollLengths.king) })
    .fromTo(
      fig,
      { yPercent: 14, scale: 1.16, opacity: 0.75 },
      { yPercent: -4, scale: 1, opacity: 1, duration: 0.7, ease: 'power1.out' },
      0,
    )
    .fromTo(
      cape,
      { xPercent: -1.4, rotate: -1.1 },
      { xPercent: 1.4, rotate: 1.1, duration: 0.5, ease: 'sine.inOut' },
      0.05,
    )
    .to(cape, { xPercent: -0.6, rotate: -0.5, duration: 0.4, ease: 'sine.inOut' }, 0.55)
    .from(copy, { opacity: 0, y: 34, duration: 0.3, ease: 'power2.out' }, 0.04)
    .to(haze, { opacity: 0.85, scale: 1.12, duration: 0.6 }, 0.1)
    .to(fig, { opacity: 0.15, filter: 'blur(7px)', duration: 0.26 }, 0.7)
    .to(copy, { opacity: 0, y: -26, duration: 0.2 }, 0.7);
}

// Chapter 3: paddy fields at sunrise with drifting motes.
export function animateFields({ q, qa, vh, pin }) {
  const plate = q('.fields__plate');
  const copy = q('.ch--fields .ch__copy');
  const sun = q('.fields__sun');
  const motes = qa('.fields__mote');
  gsap
    .timeline({ defaults: { ease: 'none' }, scrollTrigger: pin('.ch--fields', scrollLengths.fields) })
    .fromTo(
      plate,
      { scale: 1.32, yPercent: -7 },
      { scale: 1.04, yPercent: 3, duration: 1, ease: 'power1.inOut' },
      0,
    )
    .from(copy, { opacity: 0, x: -40, duration: 0.3, ease: 'power2.out' }, 0.05)
    .fromTo(sun, { xPercent: -30, opacity: 0.35 }, { xPercent: 30, opacity: 0.7, duration: 1 }, 0)
    .to(copy, { opacity: 0, y: -30, duration: 0.18 }, 0.82);
  motes.forEach((mote, i) => {
    gsap.to(mote, {
      y: () => -vh() * 0.5,
      x: `+=${(i % 2 ? 1 : -1) * (14 + (i % 4) * 9)}`,
      opacity: 0,
      duration: 9 + (i % 5) * 2.4,
      delay: fieldMotes[i].d,
      repeat: -1,
      ease: 'none',
    });
  });
}
