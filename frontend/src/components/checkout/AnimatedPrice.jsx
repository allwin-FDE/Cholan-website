import { useEffect, useRef } from 'react';
import { formatPrice } from '../../lib/format';
import { gsap } from '../../lib/gsap';
import { prefersReducedMotion } from '../../lib/motion';

// Price that counts up/down to its new value (original `zm`).
export default function AnimatedPrice({ value }) {
  const ref = useRef(null);
  const shown = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = formatPrice(value);
      shown.current = value;
      return;
    }
    const counter = { v: shown.current };
    const tween = gsap.to(counter, {
      v: value,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        shown.current = Math.round(counter.v);
        el.textContent = formatPrice(shown.current);
      },
    });
    return () => tween.kill();
  }, [value]);

  return <span ref={ref}>{formatPrice(value)}</span>;
}
