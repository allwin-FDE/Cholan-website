import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { features } from './config/features.js';
import { CartProvider } from './context/CartContext.jsx';
import ScrollToTop from './components/layout/ScrollToTop.jsx';
import Header from './components/layout/Header.jsx';
import Footer from './components/layout/Footer.jsx';
import CartDrawer from './components/layout/CartDrawer.jsx';
import PageTransition from './components/effects/PageTransition.jsx';
import InteractionFx from './components/effects/InteractionFx.jsx';
import ChatWidget from './components/chat/ChatWidget.jsx';
import Analytics from './components/common/Analytics.jsx';
import Home from './pages/Home';
import Story from './pages/Story';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import About from './pages/About';
import Blog from './pages/Blog';
import Contact from './pages/Contact';
import Checkout from './pages/Checkout';
import Policy from './pages/Policy';
import NotFound from './pages/NotFound';
import Guide from './pages/Guide';
import Post from './pages/Blog/Post.jsx';

// The shop's own admin (reports, enquiries, blog, comments, settings),
// loaded only when someone opens /admin, so the public pages never carry its
// code. Its pages live in dashboard/, the blog composer in admin/.
const Dashboard = lazy(() => import('./dashboard/Dashboard.jsx'));
// The warehouse's orders, stock and invoices, likewise only when opened.
const Warehouse = lazy(() => import('./warehouse/Warehouse.jsx'));

// Everything except /story renders inside the shell: header, page, footer, cart drawer and effects (original `Wm`).
function AppShell() {
  return (
    <div className="app-shell">
      <Header />
      <main>
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
          <Route
            path="/checkout"
            element={features.cart ? <Checkout /> : <Navigate to="/products" replace />}
          />
          <Route path="/policies/:slug" element={<Policy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
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
      <CartProvider>
        <Routes>
          <Route path="/story" element={<Story />} />
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<div className="dash-center" />}>
                <Dashboard />
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
          <Route path="*" element={<AppShell />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  );
}
