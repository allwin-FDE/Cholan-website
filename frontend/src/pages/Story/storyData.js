import { site } from '../../config/site.js';

// Pinned scroll length of each chapter, in viewport heights (original `Tf`).
export const scrollLengths = {
  temple: 1.6,
  king: 1.5,
  fields: 1.3,
  seed: 2.4,
  purity: 1.5,
  pack: 1.8,
  feast: 1.4,
  family: 1.2,
  product: 1.3,
};

// Transform origin (%) of the temple doorway the camera zooms into (original `Ef`).
export const templeDoorway = { x: 49.9, y: 78.5 };

// Seed -> paddy beats (original `Df`).
export const seedBeats = [
  { n: '01', title: 'The Seed', note: 'A single grain, and everything it holds.' },
  { n: '02', title: 'The Paddy', note: 'Root, shoot, and the long green wait.' },
  { n: '03', title: 'Nature Takes Its Time', note: 'Ripened slowly, the way it always was.' },
];

// Floating motes over the paddy field: position %, scale, animation delay (original `Of`).
export const fieldMotes = [
  { x: 8, y: 22, s: 0.7, d: 0 },
  { x: 19, y: 64, s: 1, d: 1.4 },
  { x: 31, y: 38, s: 0.55, d: 2.8 },
  { x: 44, y: 78, s: 0.85, d: 0.7 },
  { x: 57, y: 30, s: 0.65, d: 2.1 },
  { x: 68, y: 58, s: 1.05, d: 3.4 },
  { x: 79, y: 20, s: 0.6, d: 1 },
  { x: 88, y: 70, s: 0.9, d: 2.4 },
  { x: 26, y: 12, s: 0.5, d: 4 },
  { x: 72, y: 88, s: 0.75, d: 1.8 },
];

// Falling grains in the "paddy to pack" chapter (original `kf`).
export const packGrains = Array.from({ length: 14 }, (_, t) => ({
  i: t,
  x: -30 + (t % 5) * 15 + (t % 3) * 4,
  delay: t * 0.055,
  rot: -40 + t * 11,
  s: 0.5 + ((t * 37) % 60) / 100,
}));

// Footer signature columns (originals `Af`, `jf`).
export const exploreLinks = [
  { to: '/products', label: 'Products' },
  { to: '/about', label: 'Our Story' },
  { to: '/contact', label: 'Contact' },
];

export const socialLinks = [
  { href: site.social.instagram, label: 'Instagram' },
  { href: site.social.linkedin, label: 'LinkedIn' },
  { href: site.social.facebook, label: 'Facebook' },
];

// Bag shots used in the final product chapter.
export const productBags = [
  { src: '/images/stage-karikalan.webp', alt: 'Karikalan rice pack', cls: 'l' },
  { src: '/images/stage-rajabogam.webp', alt: 'Cholan Rajabogam rice pack', cls: 'm' },
  { src: '/images/stage-gramiyam.webp', alt: 'Gramiyam Ponni rice pack', cls: 'r' },
];
