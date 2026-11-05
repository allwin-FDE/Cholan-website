// True when the user asked the OS for reduced motion (original `Rd`, also duplicated as `gf`).
// The dashboard's heatmap preview (see main.jsx) also asks for the settled,
// motion-free page, so clicks line up with what is on screen.
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  document.documentElement.classList.contains('heatmap-mode');
