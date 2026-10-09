// True when the user asked the OS for reduced motion (original `Rd`, also duplicated as `gf`).
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
