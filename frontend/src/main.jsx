// The app's code (React, the pages, animations) is fetched only after a
// saved page's main picture is on screen, so on a slow phone the picture
// isn't sharing the connection with ~200 KB of code (PageSpeed, 2026-11-26).

// Stylesheets: import order == original cascade order. Do not reorder. See README.md.
import './styles/base.css';
import './styles/layout.css';
import './styles/effects.css';
import './styles/cart.css';
import './styles/hero-curtain.css';
import './styles/rail-story.css';
import './styles/cards.css';
import './styles/home-sections.css';
import './styles/rice-hall.css';
import './styles/story.css';
import './styles/products.css';
import './styles/product-detail.css';
import './styles/about.css';
import './styles/blog.css';
import './styles/contact.css';
import './styles/stores.css';
import './styles/policy.css';
import './styles/checkout.css';
import './styles/chat.css';
import './styles/guide.css';
import './styles/dashboard-frame.css';

// The page's HTML may be a saved copy from the build (scripts/prerender.mjs).
// Its head tags are marked data-pre; drop them so the app's own are the only
// ones, and let the app replace the saved body as it renders.
document.querySelectorAll('[data-pre]').forEach((el) => el.remove());
// The saved copy is already on screen: the home hero skips its intro so its
// words and bags don't vanish and come back.
window.__savedPageShown = Boolean(document.getElementById('root')?.firstElementChild);

// Inside the dashboard's heatmap preview (an iframe with ?heatmap): the page
// as a visitor first sees it, without the intro, chat button or cookie banner
// (styles/dashboard-frame.css), and without being tracked (lib/analytics.js).
if (window.top !== window.self && new URLSearchParams(window.location.search).has('heatmap')) {
  document.documentElement.classList.add('heatmap-mode');
}

// With a saved copy on screen, its main picture is shown before the app
// loads and replaces the page (PageSpeed measures that first picture), but
// never waiting more than 2.5 s; links on the saved copy work meanwhile.
if (window.__savedPageShown) {
  await new Promise((resolve) => {
    if (document.readyState === 'complete') return resolve();
    window.addEventListener('load', resolve, { once: true });
    setTimeout(resolve, 2500);
  });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
const [{ StrictMode, startTransition }, { createRoot }, { default: App, preloadAllPages, preloadPage }] = await Promise.all([
  import('react'),
  import('react-dom/client'),
  import('./App.jsx'),
]);
// The page being opened is fetched first (pages load as their own files), so
// the saved copy is replaced by the finished page, never by a blank one.
await preloadPage(window.location.pathname);
// A transition render works in short slices instead of one long block.
const root = createRoot(document.getElementById('root'));
startTransition(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
preloadAllPages();
