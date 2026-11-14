import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

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
import './styles/policy.css';
import './styles/checkout.css';
import './styles/chat.css';
import './styles/guide.css';
import './styles/dashboard-frame.css';

// The page's HTML may be a saved copy from the build (scripts/prerender.mjs).
// Its head tags are marked data-pre; drop them so the app's own are the only
// ones, and let the app replace the saved body as it renders.
document.querySelectorAll('[data-pre]').forEach((el) => el.remove());

// Inside the dashboard's heatmap preview (an iframe with ?heatmap): the page
// as a visitor first sees it, without the intro, chat button or cookie banner
// (styles/dashboard-frame.css), and without being tracked (lib/analytics.js).
if (window.top !== window.self && new URLSearchParams(window.location.search).has('heatmap')) {
  document.documentElement.classList.add('heatmap-mode');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
