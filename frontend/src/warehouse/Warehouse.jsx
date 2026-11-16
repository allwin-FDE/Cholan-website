import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../dashboard/api.js';
import { logout, watchUser } from '../dashboard/firebase.js';
import Login from '../dashboard/Login.jsx';
import Overview from '../dashboard/pages/Overview.jsx';
import Visitors from '../dashboard/pages/Visitors.jsx';
import PagesReport from '../dashboard/pages/PagesReport.jsx';
import Heatmaps from '../dashboard/pages/Heatmaps.jsx';
import Enquiries from '../dashboard/pages/Enquiries.jsx';
import { Icon } from '../dashboard/ui.jsx';
import { DashContext, can } from '../dashboard/context.js';
import Products from './pages/Products.jsx';
import Journeys from './pages/Journeys.jsx';
import Behaviour from './pages/Behaviour.jsx';
import ScrollDepth from './pages/ScrollDepth.jsx';
import Realtime from './pages/Realtime.jsx';
import Customers from './pages/Customers.jsx';
import Reports from './pages/Reports.jsx';
import '../styles/dashboard.css';
import '../styles/analyst.css';

// The menu, in the order of the owner's reference. Sections still waiting
// for their data (online buying, ad accounts, an AI assistant, or the
// owner's say on what goes in them) are listed as coming soon.
const NAV = [
  { to: '/warehouse', label: 'Overview', icon: 'grid', end: true, role: 'viewer' },
  { to: '/warehouse/visitors', label: 'Visitors', icon: 'users', role: 'viewer' },
  { to: '/warehouse/products', label: 'Products', icon: 'box', role: 'viewer' },
  { to: '/warehouse/journeys', label: 'Journeys', icon: 'route', role: 'viewer' },
  { to: '/warehouse/behaviour', label: 'Behaviour', icon: 'bolt', role: 'viewer' },
  { to: '/warehouse/heatmap', label: 'Heatmap', icon: 'target', role: 'viewer' },
  { to: '/warehouse/scroll-depth', label: 'Scroll depth', icon: 'down', role: 'viewer' },
  { to: '/warehouse/realtime', label: 'Realtime', icon: 'pulse', role: 'viewer' },
  { to: '/warehouse/customers', label: 'Customers', icon: 'user', role: 'editor' },
  { to: '/warehouse/enquiries', label: 'Enquiries', icon: 'mail', role: 'editor' },
  { to: '/warehouse/reports', label: 'Reports', icon: 'file', role: 'viewer' },
];
const SOON = [
  { label: 'Funnel', icon: 'funnel' },
  { label: 'Checkout journeys', icon: 'route' },
  { label: 'Analyst', icon: 'grid' },
  { label: 'Business Advisor', icon: 'bolt' },
  { label: 'Ad campaigns', icon: 'target' },
  { label: 'Cloud Centre', icon: 'pulse' },
  { label: 'MIS dashboard', icon: 'grid' },
  { label: 'Journal', icon: 'pen' },
  { label: 'Settings', icon: 'gear' },
];

const DAYS_KEY = 'cholan-warehouse-days';
function readDays() {
  try {
    const saved = localStorage.getItem(DAYS_KEY) || '';
    if (/^\d+$/.test(saved)) return Number(saved);
    return /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : 30;
  } catch {
    return 30;
  }
}

// /warehouse — the website analyst: visitors, products, journeys towards an
// enquiry, behaviour, heatmaps, scroll depth, who is on the site now,
// customers who enquired, and downloadable reports. Same Google sign-in and
// access list as /admin (Admin → Settings).
export default function Warehouse() {
  const [state, setState] = useState({ status: 'loading' });
  const [days, setDaysState] = useState(readDays);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const setDays = (value) => {
    setDaysState(value);
    try {
      localStorage.setItem(DAYS_KEY, String(value));
    } catch {
      // Private mode: the period holds for this visit only.
    }
  };

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

  if (state.status === 'loading') {
    return (
      <div className="dash-center">
        <div className="dash-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (state.status !== 'ready') return <Login state={state} onSignOut={signOut} />;

  const { role, email } = state.user;
  const allowed = (needed) => can(role, needed);
  const guard = (needed, element) => (allowed(needed) ? element : <NoRole needed={needed} role={role} />);
  const context = { user: state.user, role, days, setDays, allowed, base: '/warehouse', customRange: true };

  return (
    <DashContext.Provider value={context}>
      <title>Warehouse · Cholan</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className={`dash an${menuOpen ? ' dash--menu' : ''}`}>
        <aside className="dash-side an-side">
          <div className="an-brand">
            <span className="an-brand__mark">CR</span>
            <span className="an-brand__name">Warehouse</span>
          </div>
          <nav className="an-nav" aria-label="Warehouse">
            {NAV.filter((item) => allowed(item.role)).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="an-nav__link">
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
            <div className="an-nav__rule" />
            {SOON.map((item) => (
              <span key={item.label} className="an-nav__link is-soon" aria-disabled="true" title="Coming soon">
                <Icon name={item.icon} />
                {item.label}
                <span className="an-soon">Soon</span>
              </span>
            ))}
          </nav>
          <div className="an-side__foot">
            {allowed('editor') && (
              <a href="/admin" className="an-nav__link">
                <Icon name="external" />
                Admin
              </a>
            )}
            <div className="an-me">
              <span className="an-me__avatar">{email[0].toUpperCase()}</span>
              <span className="an-me__text">
                <span className="an-me__email" title={email}>
                  {email}
                </span>
                <span className="an-me__role">{role}</span>
              </span>
            </div>
          </div>
        </aside>
        <div className="dash-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <div className="dash-main an-main">
          <header className="dash-mobilebar an-mobilebar">
            <button type="button" className="dash-icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Icon name="menu" />
            </button>
            <span className="an-brand__name">Warehouse</span>
            <span />
          </header>
          <button type="button" className="an-signout" onClick={signOut}>
            Sign out
          </button>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="visitors" element={<Visitors />} />
            <Route path="pages" element={<PagesReport />} />
            <Route path="products" element={<Products />} />
            <Route path="journeys" element={<Journeys />} />
            <Route path="behaviour" element={<Behaviour />} />
            <Route path="heatmap" element={<Heatmaps />} />
            <Route path="scroll-depth" element={<ScrollDepth />} />
            <Route path="realtime" element={<Realtime />} />
            <Route path="customers" element={guard('editor', <Customers />)} />
            <Route path="enquiries" element={guard('editor', <Enquiries />)} />
            <Route path="reports" element={<Reports />} />
            <Route path="*" element={<Navigate to="/warehouse" replace />} />
          </Routes>
        </div>
      </div>
    </DashContext.Provider>
  );
}

function NoRole({ needed, role }) {
  return (
    <div className="dash-page">
      <div className="dash-empty">
        <Icon name="lock" />
        <h2>You don’t have access to this section</h2>
        <p>
          It needs <strong>{needed}</strong> access, and you have <strong>{role}</strong> access. Ask an admin to change
          your role in Admin → Settings.
        </p>
      </div>
    </div>
  );
}
