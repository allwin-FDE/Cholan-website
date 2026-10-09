import { useEffect } from 'react';
import { gsap, ScrollTrigger } from '../../lib/gsap.js';
import { prefersReducedMotion } from '../../lib/motion.js';

// Scroll-driven animations for the About page (extracted from original `wm`).
export default function useAboutAnimations(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      // Headline word rise
      gsap.utils.toArray('.ab-rise', root).forEach((heading) => {
        gsap.from(heading.querySelectorAll('.ab-word > span'), {
          yPercent: 110,
          duration: 1,
          stagger: 0.05,
          ease: 'power3.out',
          scrollTrigger: { trigger: heading, start: 'top 88%', once: true },
        });
      });

      // Generic fade-up reveals
      const revealTargets = gsap.utils.toArray('[data-reveal]', root);
      gsap.set(revealTargets, { opacity: 0, y: 30 });
      ScrollTrigger.batch(revealTargets, {
        start: 'top 88%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.9,
            stagger: 0.08,
            ease: 'power3.out',
            clearProps: 'transform',
          }),
      });

      gsap.from('.ab-quote__rule', {
        scaleX: 0,
        duration: 1.2,
        ease: 'power3.inOut',
        scrollTrigger: { trigger: '.ab-quote', start: 'top 85%', once: true },
      });

      // Timeline spine fill
      gsap.fromTo(
        '.ab-spine__fill',
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '.ab-spine',
            start: 'top 62%',
            end: 'bottom 62%',
            scrub: 0.6,
          },
        },
      );

      // Timeline stops: card slides in, year counts up
      const isMobile = window.matchMedia('(max-width: 760px)').matches;
      gsap.utils.toArray('.ab-stop', root).forEach((stop) => {
        const card = stop.querySelector('.ab-stop__card');
        const fromRight = isMobile || stop.classList.contains('ab-stop--right');
        const yearEl = stop.querySelector('.ab-stop__year');
        const year = parseInt(yearEl.textContent, 10);
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: stop,
            start: 'top 82%',
            end: 'top 50%',
            scrub: 0.6,
            onEnter: () => stop.classList.add('is-lit'),
            onLeaveBack: () => stop.classList.remove('is-lit'),
          },
        });
        timeline
          .fromTo(
            card,
            { autoAlpha: 0, x: fromRight ? 80 : -80, scale: 0.92, rotate: fromRight ? 2 : -2 },
            { autoAlpha: 1, x: 0, scale: 1, rotate: 0, ease: 'power3.out', duration: 1 },
          )
          .fromTo(
            card.querySelectorAll('h3, p'),
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, stagger: 0.15, ease: 'power2.out', duration: 0.5 },
            0.35,
          );
        if (!Number.isNaN(year)) {
          const counter = { v: year - 12 };
          timeline.to(
            counter,
            {
              v: year,
              duration: 0.8,
              ease: 'power2.out',
              onUpdate: () => (yearEl.textContent = String(Math.round(counter.v))),
            },
            0.1,
          );
        }
      });

      gsap.from('.ab-pack', {
        y: 70,
        opacity: 0,
        duration: 1.05,
        stagger: 0.12,
        ease: 'power3.out',
        scrollTrigger: { trigger: '.ab-products__packs', start: 'top 82%', once: true },
      });

      // Re-measure once images have decoded
      const images = Array.from(root.querySelectorAll('img'));
      Promise.all(
        images.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})),
      ).then(() => requestAnimationFrame(() => ScrollTrigger.refresh()));
    }, root);

    return () => ctx.revert();
  }, [rootRef]);
}
