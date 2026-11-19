import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../shared/api.js';
import { logout, watchUser } from '../shared/firebase.js';
import Login from '../shared/Login.jsx';
import { Icon } from '../shared/ui.jsx';
import { DashContext, can } from '../shared/context.js';
import { AreaElsewhere, opensArea } from '../shared/area.jsx';
import Orders from './pages/Orders.jsx';
import Stock from './pages/Stock.jsx';
import Invoices from './pages/Invoices.jsx';
import Payments from './pages/Payments.jsx';
import OnlinePayments from './pages/OnlinePayments.jsx';
import Purchases from './pages/Purchases.jsx';
import Expenses from './pages/Expenses.jsx';
import Products from './pages/Products.jsx';
import Parties from './pages/Parties.jsx';
import PriceLists from './pages/PriceLists.jsx';
import PrintDoc from './pages/PrintDoc.jsx';
import PlantOverview from './pages/PlantOverview.jsx';
import Delivery from './pages/Delivery.jsx';
import PlantHelp from './pages/PlantHelp.jsx';
import '../styles/dashboard.css';

// /warehouse: the plant's dashboard, for the production plant and the office.
// Orders and delivery, stock, buying (goods received, supplier bills and
// payments), expenses, invoices and money received, and the setup behind them
// (products and packs, customers and suppliers, price lists). The website
// side (visitors, enquiries, blog) is in /admin.
//
// Same Google sign-in and access list as /admin; a person's access in
// Settings says whether they may open this (Plant or Both). Their role says
// what they may do: viewer looks, editor (staff) works, admin approves and
// cancels.
const NAV = [
  { to: '/warehouse', label: 'Today', icon: 'grid', end: true },
  { group: 'Daily work' },
  { to: '/warehouse/orders', label: 'Orders', icon: 'cart' },
  { to: '/warehouse/delivery', label: 'Delivery', icon: 'truck' },
  { to: '/warehouse/stock', label: 'Stock', icon: 'layers' },
  { to: '/warehouse/purchases', label: 'Purchases', icon: 'download' },
  { to: '/warehouse/expenses', label: 'Expenses', icon: 'receipt' },
  { group: 'Money' },
  { to: '/warehouse/invoices', label: 'Invoices', icon: 'file' },
  { to: '/warehouse/payments', label: 'Payments and dues', icon: 'rupee' },
  { to: '/warehouse/online-payments', label: 'Online payments', icon: 'globe' },
  { group: 'Setup' },
  { to: '/warehouse/products', label: 'Products and packs', icon: 'box' },
  { to: '/warehouse/parties', label: 'Customers and suppliers', icon: 'users' },
  { to: '/warehouse/prices', label: 'Price lists', icon: 'tag' },
  { to: '/warehouse/help', label: 'Help', icon: 'help' },
];

// The website analyst pages that used to be here are in /admin now.
const TO_ADMIN = { visitors: 'visitors', pages: 'pages', journeys: 'journeys', behaviour: 'behaviour', heatmap: 'heatmaps', 'scroll-depth': 'scroll-depth', realtime: 'realtime', customers: 'customers', enquiries: 'enquiries', reports: 'reports' };

export default function Warehouse() {
  const [state, setState] = useState({ status: 'loading' });
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add('dash-root');
    return () => document.documentElement.classList.remove('dash-root');
  }, []);

  useEffect(
    () =>
      watchUser(async (user) => {
        if (!user) return setState({ status: 'signed-out' });
        try {
          setState({ status: 'ready', user: await api.me() });
        } catch (error) {
          if (error.code === 'no-access') setState({ status: 'no-access', email: user.email, message: error.message });
          else setState({ status: 'error', message: error.message });
        }
      }),
    [],
  );

  useEffect(() => setMenuOpen(false), [pathname]);

  const signOut = async () => {
    await logout();
    navigate('/warehouse');
  };

  const moved = /^\/warehouse\/([a-z-]+)\/?$/.exec(pathname)?.[1];
  if (TO_ADMIN[moved]) return <Navigate to={`/admin/${TO_ADMIN[moved]}${search}`} replace />;

  if (state.status === 'loading') {
    return (
      <div className="dash-center">
        <div className="dash-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (state.status !== 'ready') return <Login state={state} onSignOut={signOut} />;
  if (!opensArea(state.user, 'plant')) return <AreaElsewhere user={state.user} here="plant" onSignOut={signOut} />;

  const { role, email } = state.user;
  const allowed = (needed) => can(role, needed);
  const context = { user: state.user, role, days: 30, setDays: () => {}, allowed, base: '/warehouse' };

  // An invoice or credit note to print takes the whole page.
  if (/^\/warehouse\/print\/(invoice|credit-note)\/\d+\/?$/.test(pathname)) {
    return (
      <DashContext.Provider value={context}>
        <meta name="robots" content="noindex, nofollow" />
        <Routes>
          <Route path="print/invoice/:id" element={<PrintDoc kind="invoice" />} />
          <Route path="print/credit-note/:id" element={<PrintDoc kind="credit-note" />} />
        </Routes>
      </DashContext.Provider>
    );
  }

  return (
    <DashContext.Provider value={context}>
      <title>Plant · Cholan</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className={`dash${menuOpen ? ' dash--menu' : ''}`}>
        <aside className="dash-side">
          <div className="dash-brand">
            <img src="/images/cholan-logo.png" alt="Cholan" />
            <span>Plant</span>
          </div>
          <nav className="dash-nav" aria-label="Plant">
            {NAV.map((item) =>
              item.group ? (
                <span key={item.group} className="dash-nav__group">
                  {item.group}
                </span>
              ) : (
                <NavLink key={item.to} to={item.to} end={item.end} className="dash-nav__link">
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
          <div className="dash-side__foot">
            {opensArea(state.user, 'website') && (
              <a href="/admin" className="dash-nav__link">
                <Icon name="globe" />
                Website admin
              </a>
            )}
            <div className="dash-me">
              <span className="dash-me__avatar">{email[0].toUpperCase()}</span>
              <span className="dash-me__text">
                <span className="dash-me__email" title={email}>
                  {email}
                </span>
                <span className="dash-me__role">{role}</span>
              </span>
              <button type="button" className="dash-icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
                <Icon name="logout" />
              </button>
            </div>
          </div>
        </aside>
        <div className="dash-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <div className="dash-main">
          <header className="dash-mobilebar">
            <button type="button" className="dash-icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Icon name="menu" />
            </button>
            <img src="/images/cholan-logo.png" alt="Cholan" />
            <span />
          </header>
          <Routes>
            <Route index element={<PlantOverview />} />
            <Route path="orders" element={<Orders />} />
            <Route path="delivery" element={<Delivery />} />
            <Route path="stock" element={<Stock />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="payments" element={<Payments />} />
            <Route path="online-payments" element={<OnlinePayments />} />
            <Route path="products" element={<Products />} />
            <Route path="parties" element={<Parties />} />
            <Route path="prices" element={<PriceLists />} />
            <Route path="help" element={<PlantHelp />} />
            <Route path="*" element={<Navigate to="/warehouse" replace />} />
          </Routes>
        </div>
      </div>
    </DashContext.Provider>
  );
}
