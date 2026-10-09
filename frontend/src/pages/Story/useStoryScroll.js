import { useEffect } from 'react';
import { gsap, ScrollTrigger } from '../../lib/gsap.js';
import { animateTemple, animateKing, animateFields } from './animations/templeKingFields.js';
import { animateSeed } from './animations/seed.js';
import { animatePurity, animatePack } from './animations/purityPack.js';
import {
  animateFeast,
  animateFamily,
  animateProduct,
  animateFooter,
} from './animations/feastFamilyProductFooter.js';

// All GSAP/ScrollTrigger animation of the /story page (the effect inside original `Mf`).
export function useStoryScroll(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      const q = (selector) => root.querySelector(selector);
      const qa = (selector) => gsap.utils.toArray(selector, root);
      const vh = () => window.innerHeight;
      if (reduced) {
        root.classList.add('story--static');
        gsap.set(
          qa(
            '.ch__fig, .ch__copy, .ch__title, .ch__sub, .ch__eyebrow, .seed__beat, .pack__bag, .purity__grain, .purity__half',
          ),
          { clearProps: 'all', opacity: 1 },
        );
        return;
      }
      // ScrollTrigger config for a pinned chapter that lasts `screens` viewport heights.
      const pin = (trigger, screens, extra = {}) => ({
        trigger,
        start: 'top top',
        end: () => `+=${vh() * screens}`,
        pin: true,
        pinSpacing: true,
        scrub: 1,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        ...extra,
      });
      const helpers = { q, qa, vh, pin };
      animateTemple(helpers);
      animateKing(helpers);
      animateFields(helpers);
      animateSeed(helpers);
      animatePurity(helpers);
      animatePack(helpers);
      animateFeast(helpers);
      animateFamily(helpers);
      animateProduct(helpers);
      animateFooter();
      const images = Array.from(root.querySelectorAll('img'));
      Promise.all(
        images.map((img) => (img.decode ? img.decode() : Promise.resolve()).catch(() => {})),
      ).then(() => requestAnimationFrame(() => ScrollTrigger.refresh()));
    }, root);
    return () => ctx.revert();
  }, []);
}
