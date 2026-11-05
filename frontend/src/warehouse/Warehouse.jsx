import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { logout, watchUser } from '../dashboard/firebase.js';
import { Icon } from '../dashboard/ui.jsx';
import { WhContext, wh } from './shared.jsx';
import Login from './Login.jsx';
import Today from './pages/Today.jsx';
import Orders from './pages/Orders.jsx';
import OrderForm from './pages/OrderForm.jsx';
import OrderPage from './pages/OrderPage.jsx';
import PackingSlip from './pages/PackingSlip.jsx';
import Packing from './pages/Packing.jsx';
import Stock from './pages/Stock.jsx';
import Customers from './pages/Customers.jsx';
import Payments from './pages/Payments.jsx';
import Invoices, { InvoiceView } from './pages/Invoices.jsx';
import Reports from './pages/Reports.jsx';
import Team from './pages/Team.jsx';
import Activity from './pages/Activity.jsx';
import WhSettings from './pages/WhSettings.jsx';
import '../styles/dashboard.css';
import '../styles/warehouse.css';

const NAV = [
  { to: '/warehouse', label: 'Today', icon: 'grid', end: true },
  { to: '/warehouse/orders', label: 'Orders', icon: 'inbox' },
  { to: '/warehouse/packing', label: 'Packing', icon: 'check' },
  { to: '/warehouse/stock', label: 'Stock', icon: 'page' },
  { to: '/warehouse/customers', label: 'Customers', icon: 'users' },
  { to: '/warehouse/payments', label: 'Payments', icon: 'star', money: true },
  { to: '/warehouse/invoices', label: 'Invoices', icon: 'file', money: true },
  { to: '/warehouse/reports', label: 'Reports', icon: 'flame', money: true },
  { to: '/warehouse/activity', label: 'Activity', icon: 'clock', money: true },
  { to: '/warehouse/team', label: 'Team', icon: 'lock', admin: true },
  { to: '/warehouse/settings', label: 'Settings', icon: 'gear', money: true },
];
const LEVEL_NAME = { staff: 'Staff', manager: 'Manager', admin: 'Admin' };

// /warehouse: orders, stock, payments and invoices, for the people who pack and
// send the rice. Its own sign-in and its own rules (lib/auth.js on the backend);
// what staff may not see never leaves the server.
export default function Warehouse() {
  const [state, setState] = useState({ status: 'loading' }); // loading | signed-out | no-access | ready | error
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.add('dash-root');
    return () => document.documentElement.classList.remove('dash-root');
  }, []);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(
    () =>
      watchUser(async (user) => {
        if (!user) return setState({ status: 'signed-out' });
        try {
          setState({ status: 'ready', user: await wh.get('/me') });
        } catch (error) {
          setState({ status: error.code === 'no-access' ? 'no-access' : 'error', message: error.message });
        }
        return undefined;
      }),
    [],
  );

  const signOut = async () => {
    await logout();
    navigate('/warehouse');
  };

  const head = (
    <>
      <title>Warehouse · Cholan</title>
      <meta name="robots" content="noindex, nofollow" />
    </>
  );
  if (state.status === 'loading') {
    return (
      <div className="dash-center">
        {head}
        <div className="dash-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (state.status !== 'ready') {
    return (
      <>
        {head}
        <Login state={state} onSignOut={signOut} />
      </>
    );
  }

  const { user } = state;
  const seesMoney = user.level !== 'staff';
  const isAdmin = user.level === 'admin';
  const money = (element) => (seesMoney ? element : <Navigate to="/warehouse" replace />);

  return (
    <WhContext.Provider value={{ user, seesMoney, isAdmin }}>
      {head}
      <div className={`dash wh${menuOpen ? ' dash--menu' : ''}`}>
        <aside className="dash-side wh-noprint">
          <div className="dash-brand">
            <img src="/images/cholan-logo.png" alt="Cholan" />
            <span>Warehouse</span>
          </div>
          <nav className="dash-nav" aria-label="Warehouse">
            {NAV.filter((item) => (!item.money || seesMoney) && (!item.admin || isAdmin)).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="dash-nav__link">
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="dash-side__foot">
            {isAdmin && (
              <a href="/dashboard" className="dash-nav__link">
                <Icon name="external" />
                Dashboard
              </a>
            )}
            <div className="dash-me">
              <span className="dash-me__avatar">{user.name[0].toUpperCase()}</span>
              <span className="dash-me__text">
                <span className="dash-me__email" title={user.email}>
                  {user.name}
                </span>
                <span className="dash-me__role">{LEVEL_NAME[user.level]}</span>
              </span>
              <button type="button" className="dash-icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
                <Icon name="logout" />
              </button>
            </div>
          </div>
        </aside>
        <div className="dash-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <div className="dash-main">
          <header className="dash-mobilebar wh-noprint">
            <button type="button" className="dash-icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Icon name="menu" />
            </button>
            <img src="/images/cholan-logo.png" alt="Cholan" />
            <span />
          </header>
          <Routes>
            <Route index element={<Today />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/new" element={<OrderForm />} />
            <Route path="orders/:id" element={<OrderPage />} />
            <Route path="orders/:id/edit" element={<OrderForm />} />
            <Route path="orders/:id/slip" element={<PackingSlip />} />
            <Route path="packing" element={<Packing />} />
            <Route path="stock" element={<Stock />} />
            <Route path="customers" element={<Customers />} />
            <Route path="payments" element={money(<Payments />)} />
            <Route path="invoices" element={money(<Invoices />)} />
            <Route path="invoices/:id" element={money(<InvoiceView />)} />
            <Route path="reports" element={money(<Reports />)} />
            <Route path="activity" element={money(<Activity />)} />
            <Route path="settings" element={money(<WhSettings />)} />
            <Route path="team" element={isAdmin ? <Team /> : <Navigate to="/warehouse" replace />} />
            <Route path="*" element={<Navigate to="/warehouse" replace />} />
          </Routes>
        </div>
      </div>
    </WhContext.Provider>
  );
}
