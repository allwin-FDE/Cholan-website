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
import './styles/temple.css';
import './styles/cards.css';
import './styles/home-sections.css';
import './styles/story.css';
import './styles/products.css';
import './styles/product-detail.css';
import './styles/about.css';
import './styles/blog.css';
import './styles/contact.css';
import './styles/policy.css';
import './styles/checkout.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
