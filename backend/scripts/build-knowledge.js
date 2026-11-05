// Builds the chatbot's knowledge base from the website's own content.
//
//   npm run knowledge
//
// Reads the frontend's data modules (products, categories, business details,
// About page data, policies, reviews…) and the visible text of the main pages,
// and writes src/chat/knowledge.json: a list of small, self-contained chunks,
// each tied to the page it came from. The backend searches these chunks to
// answer a question, so the bot only ever knows what the site itself says.
//
// Re-run it whenever the site's content changes. The output is committed, so
// the backend deploys on its own without the frontend folder beside it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, '..', '..', 'frontend', 'src');
const out = path.resolve(here, '..', 'src', 'chat', 'knowledge.json');

const load = (rel) => import(pathToFileURL(path.join(frontend, rel)).href);

const { site } = await load('config/site.js');
const { features } = await load('config/features.js');
const { products } = await load('data/products.js');
const { categories } = await load('data/categories.js');
const { policies } = await load('data/policies.js');
const { values, milestones } = await load('pages/About/data.js');
const { reviews } = await load('pages/Home/reviews.js');

const chunks = [];
// `label` is the short name visitors see on a "From:" source link; it
// defaults to the title.
const add = (id, title, url, text, label = title) =>
  chunks.push({ id, title, label, url, text: text.replace(/[ \t]+\n/g, '\n').trim() });

const categoryName = (slug) => categories.find((c) => c.slug === slug)?.name ?? slug;
const sizes = (p) => (p.packs.length ? p.packs.map((pack) => pack.size).join(', ') : 'sizes on enquiry');

// ---- The business ----
add(
  'business',
  `${site.name} — contact details`,
  '/contact',
  [
    `Business name: ${site.name} (short name: ${site.shortName}).`,
    site.legalName && `Company: ${site.name} is a brand of ${site.legalName}${site.cin ? `, CIN ${site.cin}` : ''}.`,
    `Phone and WhatsApp: ${site.phone}.`,
    `Email: ${site.email}.`,
    `Address (shop and warehouse): ${site.address.line1}, ${site.address.line2} – ${site.address.pincode}, ${site.address.state}.`,
    site.gstin && `GSTIN: ${site.gstin}.`,
    site.fssai && `FSSAI licence number: ${site.fssai}.`,
    `Social media: Instagram ${site.social.instagram}, Facebook ${site.social.facebook}, LinkedIn ${site.social.linkedin}.`,
    `Tagline: "${site.tagline}". ${site.intro}`,
  ]
    .filter(Boolean)
    .join('\n'),
);

// ---- How to order (what the site actually offers right now) ----
add(
  'ordering',
  'How to order and prices',
  '/contact',
  [
    features.prices
      ? 'Prices are listed on each product page, for each pack size, in rupees. Prices can change; the current rate is confirmed when you order.'
      : 'Prices are not published on the website yet: every product shows "Price on request". For the current price, ask through the enquiry form on the Contact page, WhatsApp or a phone call.',
    features.cart
      ? 'Products can be added to the cart and ordered through checkout on the website.'
      : 'There is no online cart or checkout at the moment. To order, send an enquiry on the Contact page, message on WhatsApp or call.',
    `Each product page has an Enquire button that opens the Contact page with that product filled in.`,
    `Phone and WhatsApp: ${site.phone}. Email: ${site.email}.`,
    'Bulk and wholesale orders (26 kg bags, monthly supply) are quoted on request — see the bulk supply section.',
  ].join('\n'),
);

// ---- Catalogue overview ----
add(
  'catalogue',
  'Product range overview',
  '/products',
  [
    `The website lists ${products.length} products in ${categories.length} categories.`,
    'Cholan sells rice only. Millets, pulses (such as kollu) and oils are not sold any more.',
    ...categories.map((c) => {
      const list = products.filter((p) => p.category === c.slug).map((p) => p.name);
      return `${c.name} (${list.length}): ${list.join(', ')}.`;
    }),
  ].join('\n'),
);

// ---- Categories ----
for (const c of categories) {
  const list = products.filter((p) => p.category === c.slug);
  add(
    `category-${c.slug}`,
    `${c.name} — category`,
    `/products?category=${c.slug}`,
    [
      `${c.name}: ${c.blurb}`,
      `Products in ${c.name}: ${list.map((p) => `${p.name} (${sizes(p)})`).join('; ')}.`,
    ].join('\n'),
    `All ${c.name.toLowerCase()}`,
  );
}

// ---- Products ----
for (const p of products) {
  add(
    `product-${p.id}`,
    p.name,
    `/products/${p.id}`,
    [
      `Product: ${p.name}${p.tamil ? ` (Tamil: ${p.tamil})` : ''}.`,
      `Category: ${categoryName(p.category)}.`,
      p.tagline && `Tagline: ${p.tagline}.`,
      p.description,
      `Pack sizes: ${sizes(p)}.`,
      features.prices
        ? `Prices: ${p.packs.map((pack) => `${pack.size} ₹${pack.price?.toLocaleString('en-IN') ?? 'on request'}`).join('; ')}.`
        : 'Price: on request — ask on the Contact page, WhatsApp or by phone.',
      p.featured ? 'Marked as a bestseller on the website.' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

// ---- About ----
add(
  'about-promise',
  'Our promise (About page)',
  '/about',
  values.map((v) => `${v.title}: ${v.text}`).join('\n'),
  'About us',
);
add(
  'about-history',
  'Our journey and history (About page)',
  '/about',
  milestones.map((m) => `${m.year} — ${m.title}: ${m.text}`).join('\n'),
  'About us',
);

// ---- Customer reviews ----
add(
  'reviews',
  'What customers say (home page)',
  '/#reviews',
  reviews.map((r) => `${r.name}, ${r.city}, about ${r.product}: "${r.quote}"`).join('\n'),
  'Customer reviews',
);

// ---- Policies: one chunk per section. The policies run to several pages
// (the Terms alone has 25 sections), too long to send whole to the model.
// The page markup (data/policies.js) is turned into plain text: **bold** and
// [link](/path) lose their marks, tables become one line per row, and a
// detail still in [square brackets] is not decided yet, so the assistant is
// told just that.
const plain = (text) =>
  text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[[^\]]+\]/g, '(not yet confirmed)');
const bodyText = (body) =>
  body
    .map((block) => {
      if (typeof block === 'string') return plain(block);
      if (block.table) {
        const { head, rows } = block.table;
        return rows.map((row) => `- ${row.map((cell, i) => `${head[i]}: ${plain(cell)}`).join('; ')}`).join('\n');
      }
      return (block.list || block.steps).map((item) => `- ${plain(item)}`).join('\n');
    })
    .join('\n');
for (const [slug, policy] of Object.entries(policies)) {
  const url = `/policies/${slug}`;
  add(`policy-${slug}-intro`, policy.title, url, `${policy.title}: ${policy.lede}\n${bodyText(policy.intro)}`);
  policy.sections.forEach((s, i) => {
    add(`policy-${slug}-${i + 1}`, `${policy.title} — ${s.h}`, url, `${policy.title}, ${s.h}:\n${bodyText(s.body)}`, policy.title);
  });
}

// ---- Visible page copy ----
// The prose written straight into the page components (headings, paragraphs,
// button labels). Pulled from the JSX source: text between tags, plus the
// title/lede props passed to headings. Code and class names are dropped.
function pageText(rel) {
  const src = fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const pieces = [];
  for (const m of src.matchAll(/\b(?:title|lede|eyebrow)="([^"]{3,})"/g)) pieces.push(m[1]);
  for (const m of src.matchAll(/(?:splitWords|words)\('([^']{3,})'\)/g)) pieces.push(m[1]);
  for (const m of src.matchAll(/>([^<>{}]+)</g)) {
    const t = m[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
    // Fragments of JS between JSX braces (ternaries, conditions) are not prose.
    const code = /[=;()]|&&|\|\||\bnull\b|scroll|\?\s*['"\w]+\s*:/;
    if (t.length >= 3 && /[A-Za-z\u0B80-\u0BFF]{3}/.test(t) && !code.test(t)) pieces.push(t);
  }
  return [...new Set(pieces)].join('\n');
}

const pages = [
  ['page-home', 'Home page', '/', ['pages/Home/HeroCurtain.jsx', 'pages/Home/RailStory.jsx', 'pages/Home/FeaturedProducts.jsx']],
  ['page-bulk', 'Bulk and wholesale supply', '/contact', ['pages/Home/BulkSection.jsx']],
  ['page-about', 'About page', '/about', ['pages/About/index.jsx']],
  ['page-contact', 'Contact page', '/contact', ['pages/Contact/index.jsx']],
  ['page-blog', 'Blog page', '/blog', ['pages/Blog/index.jsx']],
];
for (const [id, title, url, files] of pages) {
  const text = files.map(pageText).filter(Boolean).join('\n');
  if (text) add(id, title, url, text);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ builtAt: new Date().toISOString(), chunks }, null, 2)}\n`);
console.log(`Wrote ${chunks.length} chunks to ${path.relative(process.cwd(), out)}`);
