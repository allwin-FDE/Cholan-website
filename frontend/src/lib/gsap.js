// Single place gsap and its plugins are registered (original `K` = gsap, `$` = ScrollTrigger, `dm` = Flip).
// Page code should import from here:
//   import { gsap, ScrollTrigger, Flip } from '../lib/gsap.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(ScrollTrigger, Flip);

export { gsap, ScrollTrigger, Flip };
export default gsap;
