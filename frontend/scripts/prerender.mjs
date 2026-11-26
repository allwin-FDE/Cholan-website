// Runs after `vite build`: saves a finished HTML copy of every page, and
// writes sitemap.xml and robots.txt.
//
//   npm run build        (vite build && node scripts/prerender.mjs)
//
// The site is a single-page app: without this, every address returns the same
// near-empty index.html and the content only appears once JavaScript runs.
// Search engines that run JavaScript late (or not at all) would see the same
// title and no text on every page. So each page is opened in a headless
// browser, rendered fully, and its HTML written to dist/ — /about becomes
// dist/about.html, /products/karikalan-rice becomes
// dist/products/karikalan-rice.html — which Firebase Hosting serves directly
// (see cleanUrls in firebase.json). The app then starts on top as before.
//
// Needs Playwright's Chromium: `npx playwright install chromium` once. If it is
// missing, the pages are skipped with a warning and the sitemap is still
// written, so a build never fails because of it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { preview } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const load = (rel) => import(pathToFileURL(path.join(root, 'src', rel)).href);

const { SITE_URL } = await load('config/seo.js');
const { products } = await load('data/products.js');
const { policies } = await load('data/policies.js');

// Every page worth a search result. Checkout (switched off) and the 404 page
// are left out on purpose.
// The date the files behind a page last changed, from git (so the sitemap
// tells search engines what really changed, not "everything, today").
const today = new Date().toISOString().slice(0, 10);
function changed(...files) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files.map((f) => path.join(root, f))], { cwd: root, encoding: 'utf8' }).trim();
    return out || today;
  } catch {
    return today;
  }
}
const PRODUCTS = ['src/data/products.js', 'src/pages/ProductDetail.jsx', 'src/components/product'];
const routes = [
  { path: '/', priority: '1.0', changefreq: 'weekly', lastmod: changed('src/pages/Home', 'src/data/products.js') },
  { path: '/products', priority: '0.9', changefreq: 'weekly', lastmod: changed('src/pages/Products', ...PRODUCTS) },
  // The buying guide: the page meant for "best rice" and the like.
  { path: '/rice', priority: '0.9', changefreq: 'monthly', lastmod: changed('src/data/guides.js', 'src/pages/Guide.jsx') },
  ...products.map((p) => ({ path: `/products/${p.id}`, priority: '0.8', changefreq: 'monthly', lastmod: changed(...PRODUCTS) })),
  { path: '/about', priority: '0.7', changefreq: 'monthly', lastmod: changed('src/pages/About') },
  { path: '/contact', priority: '0.7', changefreq: 'monthly', lastmod: changed('src/pages/Contact', 'src/config/site.js') },
  { path: '/stores', priority: '0.8', changefreq: 'weekly', lastmod: changed('src/pages/Stores') },
  { path: '/story', priority: '0.5', changefreq: 'monthly', lastmod: changed('src/pages/Story') },
  { path: '/blog', priority: '0.3', changefreq: 'weekly', lastmod: changed('src/pages/Blog') },
  ...Object.keys(policies).map((slug) => ({ path: `/policies/${slug}`, priority: '0.2', changefreq: 'yearly', lastmod: changed('src/data/policies.js') })),
  ...(await blogRoutes()),
  ...(await districtRoutes()),
];

// One page per district with shops (/stores/coimbatore …) and one per shop
// (/stores/coimbatore/sulur …), from the live list.
async function districtRoutes() {
  const api = process.env.VITE_API_URL;
  if (!api) return [];
  try {
    const { stores } = await (await fetch(`${api.replace(/\/$/, '')}/api/stores`)).json();
    const names = [...new Set(stores.map((s) => s.district).filter(Boolean))];
    const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return [
      ...names.map((n) => ({ path: `/stores/${slug(n)}`, priority: '0.7', changefreq: 'weekly', lastmod: today })),
      ...stores.map((s) => ({ path: `/stores/${slug(s.district || 'other')}/${slug(s.name)}`, priority: '0.6', changefreq: 'monthly', lastmod: today })),
    ];
  } catch (error) {
    console.warn(`[prerender] district pages not listed: ${error.message}`);
    return [];
  }
}

// Blog posts published from the dashboard, read from the backend the build
// talks to. A post published after the build still shows on the site; it
// joins the sitemap and gets its own saved page at the next build.
async function blogRoutes() {
  const api = process.env.VITE_API_URL;
  if (!api) return [];
  try {
    const response = await fetch(`${api.replace(/\/$/, '')}/api/posts`);
    const { posts } = await response.json();
    return posts.map((p) => ({
      path: `/blog/${p.slug}`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: String(p.updatedAt || p.publishedAt || today).slice(0, 10),
    }));
  } catch (error) {
    console.warn(`[prerender] blog posts not listed: ${error.message}`);
    return [];
  }
}

// ---- sitemap.xml and robots.txt ----
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (r) => `  <url>
    <loc>${new URL(r.path, SITE_URL).href}</loc>
    <lastmod>${r.lastmod || today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(dist, 'sitemap.xml'), sitemap);
fs.writeFileSync(
  path.join(dist, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /checkout\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);
console.log(`[prerender] sitemap.xml (${routes.length} pages) and robots.txt written`);

// The plain app shell, kept before index.html is replaced by the home page's
// saved copy. Firebase serves it for any address without a saved page (see
// the rewrite in firebase.json), so an unknown address never shows the home
// page's title and content before the app works out it is a 404.
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, 'app.html'));

// ---- The pages ----
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.warn('[prerender] Playwright is not installed; pages not prerendered.');
  process.exit(0);
}

const server = await preview({ root, logLevel: 'silent', preview: { port: 4179, strictPort: false } });
const base = server.resolvedUrls.local[0].replace(/\/$/, '');

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  console.warn(`[prerender] Chromium could not start (${error.message.split('\n')[0]}); pages not prerendered.`);
  console.warn('[prerender] Run `npx playwright install chromium` once to enable it.');
  await server.close();
  process.exit(0);
}

// Reduced motion: every animated element is captured at rest and visible,
// rather than mid-animation or hidden waiting for a scroll.
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
// Popups that open by themselves (the home page store finder) must never be
// saved into a page: a saved copy sits outside the app, can't be closed, and
// locks the page's scrolling. Each page is told it was "just shown".
await context.addInitScript(() => {
  try {
    localStorage.setItem('cholan-store-popup', String(Date.now()));
    localStorage.setItem('cholan-cookie-notice', '1');
  } catch {
    /* no storage: the capture below still removes it */
  }
});
// The backend only answers the site's own address, so reads are made as the
// site. Anything else (visit tracking and the like) is dropped: a build must
// not write to the live data.
const api = process.env.VITE_API_URL?.replace(/\/$/, '');
if (api) {
  await context.route(`${api}/**`, async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') return route.abort();
    const response = await route.fetch({ headers: { ...request.headers(), origin: SITE_URL } });
    return route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
}
const pages = [];
const capture = [...routes, { path: '/page-not-found-404', file: '404.html' }];
// Several pages at once: with a page per shop there are about 300.
let next = 0;
const worker = async () => {
  while (next < capture.length) {
    const route = capture[next];
    next += 1;
    await capturePage(route);
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
async function capturePage(route) {
  const page = await context.newPage();
  await page.goto(base + route.path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const html = await page.evaluate(() => {
    // Anything that opened over the page (a popup, its scroll lock) is left
    // out, in case it opened anyway.
    document.querySelectorAll('body > .storepop, .cookie-note').forEach((el) => el.remove());
    // Links the app added while running here (page preloads) carry this
    // machine's address (http://localhost:…): they'd fail on the real site.
    document.querySelectorAll('link[href^="http://localhost"], link[href^="http://127.0.0.1"], script[src^="http://localhost"]').forEach((el) => el.remove());
    // The font links switch themselves to stylesheets once loaded; saved that
    // way they'd hold every page back again. Back to "load without blocking".
    document.head.querySelectorAll('link[onload][href^="https://fonts.googleapis.com/"]').forEach((el) => {
      el.setAttribute('rel', 'preload');
      el.setAttribute('as', 'style');
    });
    document.documentElement.style.removeProperty('overflow');
    // Head tags React placed for this page: marked so the app can remove them
    // before it renders its own (otherwise each would appear twice).
    document.head
      .querySelectorAll(
        'title, meta[name="description"], meta[name="robots"], link[rel="canonical"], meta[property^="og:"], meta[name^="twitter:"]',
      )
      .forEach((el) => el.setAttribute('data-pre', ''));
    return `<!doctype html>\n${document.documentElement.outerHTML}`;
  });
  const title = await page.title();
  pages.push({ route: route.path, file: route.file, html, title });
  await page.close();
}
pages.sort((a, b) => capture.findIndex((r) => r.path === a.route) - capture.findIndex((r) => r.path === b.route));
await browser.close();
await server.close();

// Written only after every page is captured, so no page is rendered from
// another page's saved copy.
for (const { route, file: named, html, title } of pages) {
  const file = named ? path.join(dist, named) : route === '/' ? path.join(dist, 'index.html') : path.join(dist, `${route.slice(1)}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  console.log(`[prerender] ${route.padEnd(42)} ${title}`);
}
