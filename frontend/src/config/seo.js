// Search engine settings: the site's public address, and the title and
// description each page gives search results and link previews. Each
// description is written to read well as a Google snippet (under ~160
// characters) and to carry the words people actually search for.
import { site } from './site.js';

// The canonical address. Every page's canonical link and the sitemap use it,
// so Google treats www.cholanrice.in as the one true copy (not the
// .web.app or .firebaseapp.com addresses that serve the same files).
export const SITE_URL = 'https://www.cholanrice.in';

export const absoluteUrl = (path = '/') => new URL(path, SITE_URL).href;

// Shown when a page is shared on WhatsApp, Facebook and the like.
export const DEFAULT_IMAGE = absoluteUrl('/images/og-cover.jpg');

const BRAND = `${site.name}, Coimbatore`;
export const pageTitle = (title) => (title ? `${title} | ${BRAND}` : `${site.name} — Rice Online, Coimbatore`);

export const pages = {
  home: {
    path: '/',
    title: null,
    description:
      'Cholan Rice and Millet Shop, Coimbatore: Chennai Pattinam Ponni, Karikalan, Moongil Ponni, Senthoora, idli rice, seeraga samba and basmati — 1 kg to 26 kg bags, delivered across India.',
  },
  products: {
    path: '/products',
    title: 'Rice — All Products',
    description:
      'Shop Cholan rice: Chennai Pattinam Ponni, Karikalan, Kettimelam, Moongil Ponni, Senthoora, Thooyamalli Ponni raw rice, idli rice, kurunai (broken rice), basmati and seeraga samba, in 1 kg to 26 kg packs.',
  },
  about: {
    path: '/about',
    title: 'About Us — Rice Traders Since 1998',
    description:
      'Cholan Rice and Millet Shop began as a rice trading counter in 1998 and now mills and packs rice in Coimbatore, Tamil Nadu.',
  },
  contact: {
    path: '/contact',
    title: 'Contact Us — Orders & Bulk Enquiries',
    description: `Order rice or ask for a bulk quote. Call or WhatsApp ${site.phone}, email ${site.email}, or visit us in Sanganoor, Coimbatore.`,
  },
  blog: {
    path: '/blog',
    title: 'Blog',
    description: 'News, recipes and stories from Cholan Rice and Millet Shop, Coimbatore. Our first posts are on their way.',
  },
  story: {
    path: '/story',
    title: 'Our Story',
    description:
      'The story of Cholan rice: from the paddy fields of the Chola land to your kitchen — how our rice is grown, milled and packed.',
  },
};

// The shop itself, for Google's knowledge of local businesses: who it is,
// where it is, how to reach it. Added to the home, about and contact pages.
export const businessSchema = {
  '@context': 'https://schema.org',
  '@type': 'GroceryStore',
  '@id': `${SITE_URL}/#business`,
  name: site.name,
  alternateName: ['Cholan Rice', 'Cholan Rice & Millets', 'சோழன் அரிசி கடை'],
  description:
    'Rice — Ponni rice, raw rice, idli rice, seeraga samba, basmati and broken rice — sold in 1 kg to 26 kg packs, with bulk supply for messes, hotels and retailers.',
  url: SITE_URL,
  logo: absoluteUrl('/images/cholan-logo.png'),
  image: DEFAULT_IMAGE,
  telephone: site.phone,
  email: site.email,
  vatID: site.gstin || undefined,
  address: {
    '@type': 'PostalAddress',
    streetAddress: site.address.line1,
    addressLocality: 'Coimbatore',
    addressRegion: 'Tamil Nadu',
    postalCode: site.address.pincode,
    addressCountry: 'IN',
  },
  legalName: site.legalName,
  areaServed: { '@type': 'Country', name: 'India' },
  sameAs: Object.values(site.social),
};

export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: site.name,
  alternateName: 'Cholan Rice',
  url: SITE_URL,
  inLanguage: ['en-IN', 'ta-IN'],
  publisher: { '@id': `${SITE_URL}/#business` },
};
