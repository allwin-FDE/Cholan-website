import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { features } from './config/features.js';
import { CartProvider } from './context/CartContext.jsx';
import ScrollToTop from './components/layout/ScrollToTop.jsx';
import Header from './components/layout/Header.jsx';
import Footer from './components/layout/Footer.jsx';
import CartDrawer from './components/layout/CartDrawer.jsx';
import PageTransition from './components/effects/PageTransition.jsx';
import InteractionFx from './components/effects/InteractionFx.jsx';
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
          <Route path="/about" element={<About />} />
          <Route path="/process" element={<Navigate to="/about" replace />} />
          <Route path="/blog" element={<Blog />} />
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
    </div>
  );
}

// Root component (original `Um`): router + cart provider. /story is a full-bleed page without the shell.
export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <CartProvider>
        <Routes>
          <Route path="/story" element={<Story />} />
          <Route path="*" element={<AppShell />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  );
}
