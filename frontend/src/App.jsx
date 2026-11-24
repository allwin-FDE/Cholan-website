import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { features } from './config/features.js';
import { CartProvider } from './context/CartContext.jsx';
import { StockProvider } from './context/StockContext.jsx';
import ScrollToTop from './components/layout/ScrollToTop.jsx';
import Header from './components/layout/Header.jsx';
import Footer from './components/layout/Footer.jsx';
import CartDrawer from './components/layout/CartDrawer.jsx';
import PageTransition from './components/effects/PageTransition.jsx';
import InteractionFx from './components/effects/InteractionFx.jsx';
import ChatWidget from './components/chat/ChatWidget.jsx';
import Analytics from './components/common/Analytics.jsx';
import CookieNotice from './components/common/CookieNotice.jsx';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import NotFound from './pages/NotFound';
import { lazyPage } from './lib/lazyPage.js';

// Pages most visits never open load as their own files (the audit: one
// 610 KB file on every page). The home and product pages stay in the main one.
const Story = lazyPage(() => import('./pages/Story'));
const About = lazyPage(() => import('./pages/About'));
const Blog = lazyPage(() => import('./pages/Blog'));
const Post = lazyPage(() => import('./pages/Blog/Post.jsx'));
const Contact = lazyPage(() => import('./pages/Contact'));
const Stores = lazyPage(() => import('./pages/Stores'));
const District = lazyPage(() => import('./pages/Stores/District.jsx'));
const Checkout = lazyPage(() => import('./pages/Checkout'), (m) => m.default);
const OrderConfirmed = lazyPage(() => import('./pages/Checkout'), (m) => m.OrderConfirmed);
const Policy = lazyPage(() => import('./pages/Policy'));
const Guide = lazyPage(() => import('./pages/Guide'));

// The page an address opens, so main.jsx can fetch it before the app starts.
const PAGES = [
  [/^\/story\/?$/, Story],
  [/^\/about\/?$/, About],
  [/^\/blog\/?$/, Blog],
  [/^\/blog\/./, Post],
  [/^\/contact\/?$/, Contact],
  [/^\/stores\/?$/, Stores],
  [/^\/stores\/./, District],
  [/^\/checkout\/confirmed/, OrderConfirmed],
  [/^\/checkout/, Checkout],
  [/^\/policies\//, Policy],
  [/^\/rice\/?$/, Guide],
];
export function preloadPage(pathname) {
  const hit = PAGES.find(([re]) => re.test(pathname));
  return hit ? hit[1].preload().catch(() => {}) : Promise.resolve();
}
// After the first page is up, the rest are fetched quietly, so moving
// between pages has no wait.
export function preloadAllPages() {
  const run = () => PAGES.forEach(([, Page]) => Page.preload().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2500);
}

// The website admin at /admin (visitors and the analyst reports, enquiries,
// blog, comments, settings), loaded only when someone opens it, so the public
// pages never carry its code. Its pages live in dashboards/admin/pages/, the
// blog composer in dashboards/admin/blog/.
const Admin = lazy(() => import('./dashboards/admin/Admin.jsx'));
// The plant dashboard at /warehouse (orders, delivery, stock, purchases,
// money), likewise only when opened.
const Warehouse = lazy(() => import('./dashboards/warehouse/Warehouse.jsx'));
// The WhatsApp campaign dashboard at /whatsapp, likewise only when opened.
const WhatsApp = lazy(() => import('./dashboards/whatsapp/WhatsApp.jsx'));

// Everything except /story renders inside the shell: header, page, footer, cart drawer and effects (original `Wm`).
function AppShell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<div className="page-loading" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          {/* Old spelling of Thooyamalli, live for a day. */}
          <Route path="/products/thaymalli-ponni-raw-rice" element={<Navigate to="/products/thooyamalli-ponni-raw-rice" replace />} />
          {/* The buying guide: the page that answers "best rice". Millets and
              pulses are no longer sold, so their old guides go to the products. */}
          <Route path="/rice" element={<Guide slug="rice" key="rice" />} />
          <Route path="/millets" element={<Navigate to="/products" replace />} />
          <Route path="/pulses" element={<Navigate to="/products" replace />} />
          <Route path="/about" element={<About />} />
          <Route path="/process" element={<Navigate to="/about" replace />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<Post />} />
          <Route path="/contact" element={<Contact />} />
          {/* The store finder: the nearest Cholan shop by road distance. */}
          <Route path="/stores" element={<Stores />} />
          {/* One page per district: "Cholan rice shops in Erode". */}
          <Route path="/stores/:district" element={<District />} />
          <Route path="/store-locator" element={<Navigate to="/stores" replace />} />
          <Route
            path="/checkout"
            element={features.cart ? <Checkout /> : <Navigate to="/products" replace />}
          />
          <Route path="/checkout/confirmed" element={<OrderConfirmed />} />
          <Route path="/policies/:slug" element={<Policy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </main>
      <Footer />
      {features.cart && <CartDrawer />}
      <PageTransition />
      <InteractionFx />
      <ChatWidget />
    </div>
  );
}

// The admin used to be at /dashboard. Old bookmarks and sign-in links keep
// working: the rest of the address and its ?query (a sign-in link's code) go along.
function ToAdmin() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/dashboard/, '/admin')}${search}${hash}`} replace />;
}

// Root component (original `Um`): router + cart provider. /story is a full-bleed page without the shell,
// and /admin is the shop's own tool, with its own layout.
export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Analytics />
      <CookieNotice />
      <CartProvider>
      <StockProvider>
        <Routes>
          <Route
            path="/story"
            element={
              <Suspense fallback={<div className="page-loading" />}>
                <Story />
              </Suspense>
            }
          />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<div className="dash-center" />}>
                <Admin />
              </Suspense>
            }
          />
          <Route path="/dashboard/*" element={<ToAdmin />} />
          <Route
            path="/warehouse/*"
            element={
              <Suspense fallback={<div className="dash-center" />}>
                <Warehouse />
              </Suspense>
            }
          />
          <Route
            path="/whatsapp/*"
            element={
              <Suspense fallback={<div className="dash-center" />}>
                <WhatsApp />
              </Suspense>
            }
          />
          <Route path="*" element={<AppShell />} />
        </Routes>
      </StockProvider>
      </CartProvider>
    </BrowserRouter>
  );
}
