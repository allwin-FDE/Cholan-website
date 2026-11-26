import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from '../../lib/gsap.js';
import { site } from '../../config/site.js';
import { useSnapScroll } from '../../hooks/useSnapScroll.js';

// Each bag has a phone-sized copy (-480) and a lighter full one (-2).
const packs = [
  {
    src: '/images/hero-chennai-pattanam-white-ponni.webp',
    w: 634,
    alt: 'Chennai Pattanam Special Rajabhogam White Ponni rice bag',
    cls: 'side-l',
  },
  { src: '/images/hero-karikalan-super-ponni.webp', w: 648, alt: 'Karikalan Super Ponni Rice bag', cls: 'hero' },
  { src: '/images/hero-moongil-poompuhar-ponni.webp', w: 615, alt: 'Cholan Moongil Poompuhar Ponni rice bag', cls: 'side-r' },
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
      if (reduced || window.__savedPageShown) return;
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
      // The side bags come out at once, alongside the headline rather than
      // after it, so all three are in place within half a second.
      tl.to([packLeft, packRight], { opacity: 1, duration: 0.25, ease: 'none' }, 0)
        .to([packLeft, packRight], { '--slide': '0%', duration: 0.5, ease: 'power3.out' }, 0)
        .to(
          words,
          {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.7,
            stagger: 0.06,
            ease: 'power2.out',
            clearProps: 'filter',
          },
          0,
        );
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
    // The next section lands at the very top, so none of the hero is left
    // showing behind the floating header (owner, 2026-11-25); its own top
    // padding keeps its heading clear of the header (hero-curtain.css).
    const nextTop = Math.round(next.getBoundingClientRect().top + scrollY);
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
            src="/images/hero-pillar-carved-2.webp"
            width="329"
            height="1645"
            alt=""
            aria-hidden="true"
          />
          <img
            className="curtain__pillar curtain__pillar--r"
            src="/images/hero-pillar-carved-2.webp"
            width="329"
            height="1645"
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
                    src={pack.src.replace(/\.webp$/, '-2.webp')}
                    srcSet={`${pack.src.replace(/\.webp$/, '-480.webp')} 480w, ${pack.src.replace(/\.webp$/, '-2.webp')} ${pack.w}w`}
                    sizes="(max-width: 700px) 42vw, 300px"
                    width={pack.w}
                    height="900"
                    alt={pack.alt}
                    // The centre bag is the first thing people see: fetched first.
                    fetchPriority={pack.cls === 'hero' ? 'high' : 'auto'}
                    decoding={pack.cls === 'hero' ? 'sync' : 'async'}
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
