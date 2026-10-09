import { site } from '../../config/site.js';

// "Our promise" values (original `_m`).
export const values = [
  {
    title: 'Know Your Grain',
    text: 'We understand the journey behind every grain — from farm to family table.',
    icon: 'grain',
  },
  {
    title: 'Keeping Nature Intact',
    text: 'Minimal processing that respects the grain and preserves its natural character.',
    icon: 'gear',
  },
  {
    title: 'Growing Together',
    text: 'Building meaningful relationships with farmers who nurture every harvest.',
    icon: 'leaf',
  },
  {
    title: 'Trust in Every Pack',
    text: 'Delivering the same quality your family can depend on, every single time.',
    icon: 'badge',
  },
];

// Timeline stops (original `vm`).
export const milestones = [
  {
    year: '1998',
    title: 'A single trading counter',
    text: 'The family began trading paddy in Salem, supplying local provision stores.',
  },
  {
    year: '2006',
    title: 'Our own milling',
    text: 'We moved from trading to milling, taking control of grading and quality.',
  },
  {
    year: '2015',
    title: 'The millet revival',
    text: 'We began sourcing native millets and heritage rice as demand for them returned.',
  },
  {
    year: '2024',
    title: 'Direct to your home',
    text: 'Launched direct household delivery alongside our wholesale business.',
  },
];

// Pack photos (original `ym`).
export const packs = [
  { img: 'stage-karikalan', alt: 'Karikalan rice, 25 kg bulk pack' },
  { img: 'stage-rajabogam', alt: 'Cholan Rajabogam rice bag' },
  { img: 'stage-gramiyam', alt: 'Gramiyam Bapatla Ponni rice, 26 kg bag' },
];

// Google Maps directions link (original `Sm`).
export const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.address.line1}, ${site.address.line2} ${site.address.pincode}, ${site.address.state}`)}`;
