import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '../../lib/gsap.js';
import { site } from '../../config/site.js';
import { useSnapScroll, getSectionTop } from '../../hooks/useSnapScroll.js';

const packs = [
  {
    src: '/images/stage-chennai-pattinam.webp',
    alt: 'Chennai Pattinam Ponni rice pack',
    cls: 'side-l',
  },
  { src: '/images/stage-karikalan.webp', alt: 'Karikalan 25 kg bulk pack', cls: 'hero' },
  { src: '/images/stage-moongil.webp', alt: 'Cholan Moongil Ponni 26 kg pack', cls: 'side-r' },
];

const lede = 'Carefully selected grains, packed with purpose.';

// Home hero (original `nf`; data `ef`, `tf`).
export default function HeroCurtain() {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cleanupReveal = null;
    const ctx = gsap.context(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const words = gsap.utils.toArray('.curtain__w', root);
      const packLeft = root.querySelector('.curtain__pack--side-l');
      const packRight = root.querySelector('.curtain__pack--side-r');
      if (reduced) return;
      gsap.set(words, { opacity: 0, y: 18, filter: 'blur(6px)' });
      gsap.set([packLeft, packRight], { opacity: 0 });
      gsap.set(packLeft, { '--slide': '45%' });
      gsap.set(packRight, { '--slide': '-45%' });
      const tl = gsap.timeline({ paused: true });
      const reveal = () => {
        window.removeEventListener('fx:reveal', reveal);
        clearTimeout(fallback);
        tl.play();
      };
      window.addEventListener('fx:reveal', reveal);
      const fallback = setTimeout(reveal, 3e3);
      cleanupReveal = () => {
        window.removeEventListener('fx:reveal', reveal);
        clearTimeout(fallback);
      };
      tl.to(words, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.8,
        stagger: 0.07,
        ease: 'power2.out',
        clearProps: 'filter',
      })
        .to([packLeft, packRight], { opacity: 1, duration: 0.45, ease: 'none' }, '-=0.25')
        .to([packLeft, packRight], { '--slide': '0%', duration: 0.85, ease: 'power3.out' }, '<');
      gsap.to(root.querySelector('.curtain__inner'), {
        yPercent: 16,
        opacity: 0.4,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: true },
      });
      const images = Array.from(root.querySelectorAll('img'));
      Promise.all(
        images.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})),
      ).then(() => requestAnimationFrame(() => ScrollTrigger.refresh()));
    }, root);
    return () => {
      cleanupReveal?.();
      ctx.revert();
    };
  }, []);

  useSnapScroll(ref, (direction, scrollY) => {
    const next = ref.current?.nextElementSibling;
    if (!next) return null;
    const nextTop = getSectionTop(next);
    return direction > 0
      ? scrollY < nextTop - 2
        ? nextTop
        : null
      : scrollY > 2 && scrollY <= nextTop + window.innerHeight * 0.25
        ? 0
        : null;
  });

  return (
    <section className="curtain" ref={ref} aria-label={site.name}>
      <div className="curtain__pin">
        <div className="curtain__body">
          <div className="curtain__kolam" aria-hidden="true" />
          <img
            className="curtain__pillar curtain__pillar--l"
            src="/images/hero-pillar-carved.webp"
            alt=""
            aria-hidden="true"
          />
          <img
            className="curtain__pillar curtain__pillar--r"
            src="/images/hero-pillar-carved.webp"
            alt=""
            aria-hidden="true"
          />
          <div className="curtain__inner">
            <div className="curtain__opening">
              <h1 className="curtain__lede" aria-label={lede}>
                {lede.split(' ').flatMap((word, i) => [
                  i > 0 ? ' ' : null,
                  <span key={i} className="curtain__w" aria-hidden="true">
                    {word}
                  </span>,
                ])}
              </h1>
            </div>
            <div className="curtain__stage">
              <div className="curtain__packs">
                {packs.map((pack) => (
                  <img
                    key={pack.src}
                    className={`curtain__pack curtain__pack--${pack.cls}`}
                    src={pack.src}
                    alt={pack.alt}
                    decoding="async"
                  />
                ))}
              </div>
              <div className="curtain__floor" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
