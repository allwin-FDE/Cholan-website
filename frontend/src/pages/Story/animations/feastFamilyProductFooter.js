import { gsap } from '../../../lib/gsap.js';
import { scrollLengths } from '../storyData.js';

// Chapter 7: slow push-in on the royal dining table.
export function animateFeast({ q, pin }) {
  const plate = q('.feast__plate');
  const blur = q('.feast__blur');
  const copy = q('.ch--feast .ch__copy');
  const warm = q('.feast__warm');
  gsap
    .timeline({ defaults: { ease: 'none' }, scrollTrigger: pin('.ch--feast', scrollLengths.feast) })
    .fromTo(plate, { scale: 1 }, { scale: 1.45, duration: 1, ease: 'power1.inOut' }, 0)
    .fromTo(blur, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.15)
    .from(copy, { opacity: 0, y: 30, duration: 0.2, ease: 'power2.out' }, 0.03)
    .to(warm, { opacity: 0.55, duration: 0.7 }, 0.1)
    .to(copy, { opacity: 0, duration: 0.14 }, 0.86);
}

// Chapter 8: banana leaf and rice.
export function animateFamily({ q, pin }) {
  const leaf = q('.family__leaf');
  const rice = q('.family__rice');
  const copy = q('.ch--family .ch__copy');
  gsap
    .timeline({ defaults: { ease: 'none' }, scrollTrigger: pin('.ch--family', scrollLengths.family) })
    .fromTo(
      leaf,
      { scale: 1.1, opacity: 0, rotate: -2 },
      { scale: 1, opacity: 1, rotate: 0, duration: 0.3, ease: 'power2.out' },
      0,
    )
    .fromTo(
      rice,
      { scale: 0.7, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.26, ease: 'back.out(1.2)' },
      0.16,
    )
    .from(copy, { opacity: 0, y: 26, duration: 0.22, ease: 'power2.out' }, 0.2)
    .to(q('.family__steam'), { opacity: 1, duration: 0.3 }, 0.3);
}

// Chapter 9: the product bags, with an endless gentle float.
export function animateProduct({ q, qa, pin }) {
  const bags = qa('.product__bag');
  const copy = q('.ch--product .ch__copy');
  const silhouettes = q('.product__silhouettes');
  gsap
    .timeline({ defaults: { ease: 'none' }, scrollTrigger: pin('.ch--product', scrollLengths.product) })
    .from(copy, { opacity: 0, y: 32, duration: 0.24, ease: 'power2.out' }, 0)
    .from(bags, { opacity: 0, y: 46, duration: 0.3, stagger: 0.07, ease: 'power2.out' }, 0.06)
    .fromTo(silhouettes, { opacity: 0, scale: 1.08 }, { opacity: 0.22, scale: 1, duration: 0.5 }, 0)
    .fromTo(
      '.product__shadow',
      { xPercent: -14, scaleX: 1.1, opacity: 0.16 },
      { xPercent: 14, scaleX: 0.92, opacity: 0.26, duration: 0.9, ease: 'sine.inOut' },
      0.1,
    );
  bags.forEach((bag, i) => {
    gsap.to(bag, {
      y: i === 1 ? -11 : -7,
      duration: 3.4 + i * 0.45,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
      delay: i * 0.5,
    });
  });
}

// Signature footer reveal (un-pinned, scrubbed).
export function animateFooter() {
  gsap
    .timeline({
      scrollTrigger: {
        trigger: '.ch--footer',
        start: 'top 78%',
        end: 'bottom bottom',
        scrub: 1.4,
        invalidateOnRefresh: true,
      },
    })
    .fromTo('.sig__rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, 0)
    .fromTo(
      '.sig__line',
      { opacity: 0, y: 34 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
      0.12,
    )
    .fromTo('.sig__nandi', { opacity: 0, scale: 1.06 }, { opacity: 0.16, scale: 1, duration: 0.5 }, 0)
    .fromTo(
      '.sig__col',
      { opacity: 0, y: 26 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out' },
      0.3,
    )
    .fromTo(
      '.sig__logo',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
      0.5,
    );
}
