import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../shared/api.js';
import { logout, watchUser } from '../shared/firebase.js';
import Login from '../shared/Login.jsx';
import Overview from './pages/Overview.jsx';
import Sources from './pages/Sources.jsx';
import Visitors from './pages/Visitors.jsx';
import PagesReport from './pages/PagesReport.jsx';
import Heatmaps from './pages/Heatmaps.jsx';
import Enquiries from './pages/Enquiries.jsx';
import Subscribers from './pages/Subscribers.jsx';
import BlogList from './pages/BlogList.jsx';
import Comments from './pages/Comments.jsx';
import BlogEditor from './pages/BlogEditor.jsx';
import NewPost from './blog/NewPost.jsx';
import Settings from './pages/Settings.jsx';
import Help from './pages/Help.jsx';
import Products from './pages/Products.jsx';
import Journeys from './pages/Journeys.jsx';
import Behaviour from './pages/Behaviour.jsx';
import ScrollDepth from './pages/ScrollDepth.jsx';
import Realtime from './pages/Realtime.jsx';
import Customers from './pages/Customers.jsx';
import Reports from './pages/Reports.jsx';
import { Icon } from '../shared/ui.jsx';
import { DashContext, can } from '../shared/context.js';
import { AreaElsewhere, opensArea } from '../shared/area.jsx';
import '../styles/dashboard.css';
import '../styles/analyst.css';
import '../styles/admin.css';

// /admin: the website and IT side. How the website is doing (visitors,
// pages, products people look at, journeys, behaviour, heatmaps, scroll
// depth, who is on it now, reports), the people who reach out (enquiries,
// customers who enquired, subscribers), the blog and comments, and Settings:
// who has access. Orders, stock, purchases and money are in /warehouse, the
// plant's dashboard.
const NAV = [
  { group: 'Website' },
  { to: '/admin', label: 'Overview', icon: 'grid', end: true, role: 'viewer' },
  { to: '/admin/realtime', label: 'Realtime', icon: 'pulse', role: 'viewer' },
  { to: '/admin/sources', label: 'Sources', icon: 'globe', role: 'viewer' },
  { to: '/admin/visitors', label: 'Visitors', icon: 'users', role: 'viewer' },
  { to: '/admin/pages', label: 'Pages', icon: 'file', role: 'viewer' },
  { to: '/admin/products', label: 'Products', icon: 'box', role: 'viewer' },
  { to: '/admin/journeys', label: 'Journeys', icon: 'route', role: 'viewer' },
  { to: '/admin/behaviour', label: 'Behaviour', icon: 'bolt', role: 'viewer' },
  { to: '/admin/heatmaps', label: 'Heatmaps', icon: 'target', role: 'viewer' },
  { to: '/admin/scroll-depth', label: 'Scroll depth', icon: 'down', role: 'viewer' },
  { to: '/admin/reports', label: 'Reports', icon: 'download', role: 'viewer' },
  { group: 'People', role: 'editor' },
  { to: '/admin/enquiries', label: 'Enquiries', icon: 'inbox', role: 'editor' },
  { to: '/admin/customers', label: 'Customers', icon: 'user', role: 'editor' },
  { to: '/admin/subscribers', label: 'Subscribers', icon: 'mail', role: 'editor' },
  { group: 'Content', role: 'editor' },
  { to: '/admin/blog', label: 'Blog', icon: 'pen', role: 'editor' },
  { to: '/admin/comments', label: 'Comments', icon: 'chat', role: 'editor' },
  { group: 'Admin' },
  { to: '/admin/settings', label: 'Settings', icon: 'gear', role: 'admin' },
  { to: '/admin/help', label: 'Help', icon: 'help', role: 'viewer' },
];

// The business screens moved to /warehouse: old links and bookmarks follow.
const MOVED = {
  orders: 'orders',
  stock: 'stock',
  invoices: 'invoices',
  payments: 'payments',
  online: 'online-payments',
  purchases: 'purchases',
  expenses: 'expenses',
  products: 'products',
  parties: 'parties',
  prices: 'prices',
};
function ToWarehouse() {
  const { pathname, search } = useLocation();
  const print = /^\/admin\/print\/(.+)$/.exec(pathname);
  if (print) return <Navigate to={`/warehouse/print/${print[1]}${search}`} replace />;
  const page = /^\/admin\/business\/([a-z]+)/.exec(pathname)?.[1];
  return <Navigate to={`/warehouse${MOVED[page] ? `/${MOVED[page]}` : ''}${search}`} replace />;
}

const DAYS_KEY = 'cholan-dashboard-days';
function readDays() {
  try {
    const saved = localStorage.getItem(DAYS_KEY) || '';
    if (/^\d+$/.test(saved)) return Number(saved);
    return /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : 30;
  } catch {
    return 30;
  }
}

export default function Admin() {
  const [state, setState] = useState({ status: 'loading' }); // loading | signed-out | no-access | ready | error
  const [days, setDaysState] = useState(readDays);
  const [menuOpen, setMenuOpen] = useState(false);
  const [waiting, setWaiting] = useState({ comments: 0 });
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

  // How many comments are waiting, shown on the Comments menu item.
  const canReview = state.status === 'ready' && can(state.user.role, 'editor') && opensArea(state.user, 'website');
  useEffect(() => {
    if (!canReview) return undefined;
    const refresh = () => api.reviewCount().then(setWaiting).catch(() => {});
    refresh();
    window.addEventListener('cholan:review', refresh);
    return () => window.removeEventListener('cholan:review', refresh);
  }, [canReview, pathname]);

  const signOut = async () => {
    await logout();
    navigate('/admin');
  };

  // Business addresses moved to /warehouse; send them on before signing in.
  if (/^\/admin\/(business|print)(\/|$)/.test(pathname)) return <ToWarehouse />;

  if (state.status === 'loading') {
    return (
      <div className="dash-center">
        <div className="dash-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (state.status !== 'ready') return <Login state={state} onSignOut={signOut} />;
  if (!opensArea(state.user, 'website')) return <AreaElsewhere user={state.user} here="website" onSignOut={signOut} />;

  const { role, email } = state.user;
  const allowed = (needed) => can(role, needed);
  const guard = (needed, element) => (allowed(needed) ? element : <NoRole needed={needed} role={role} />);
  const context = { user: state.user, role, days, setDays, allowed, base: '/admin', customRange: true };

  // Writing a blog takes the whole screen, like a phone's composer.
  if (/^\/admin\/blog\/(new|edit\/[^/]+)\/?$/.test(pathname)) {
    return (
      <DashContext.Provider value={context}>
        <title>Write a blog · Cholan</title>
        <meta name="robots" content="noindex, nofollow" />
        <div className="adm">
          <Routes>
            <Route path="blog/new" element={guard('editor', <NewPost />)} />
            <Route path="blog/edit/:id" element={guard('editor', <NewPost />)} />
          </Routes>
        </div>
      </DashContext.Provider>
    );
  }

  const shown = NAV.filter((item) => allowed(item.role || 'viewer')).filter((item, i, list) => !item.group || (list[i + 1] && !list[i + 1].group));
  return (
    <DashContext.Provider value={context}>
      <title>Admin · Cholan</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className={`dash an${menuOpen ? ' dash--menu' : ''}`}>
        <aside className="dash-side an-side">
          <div className="an-brand">
            <span className="an-brand__mark">CR</span>
            <span className="an-brand__name">Admin</span>
          </div>
          <nav className="an-nav" aria-label="Admin">
            {shown.map((item) =>
              item.group ? (
                <span key={item.group} className="an-nav__group">
                  {item.group}
                </span>
              ) : (
                <NavLink key={item.to} to={item.to} end={item.end} className="an-nav__link">
                  <Icon name={item.icon} />
                  {item.label}
                  {item.to === '/admin/comments' && waiting.comments > 0 && (
                    <span className="dash-nav__count" aria-label={`${waiting.comments} waiting for approval`}>
                      {waiting.comments}
                    </span>
                  )}
                </NavLink>
              ),
            )}
          </nav>
          <div className="an-side__foot">
            {opensArea(state.user, 'plant') && (
              <a href="/warehouse" className="an-nav__link">
                <Icon name="truck" />
                Plant dashboard
              </a>
            )}
            <a href="/" target="_blank" rel="noreferrer" className="an-nav__link">
              <Icon name="external" />
              Open website
            </a>
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
            <span className="an-brand__name">Admin</span>
            <span />
          </header>
          <button type="button" className="an-signout" onClick={signOut}>
            Sign out
          </button>
          <Routes>
            <Route index element={<Overview />} />
            <Route path="realtime" element={<Realtime />} />
            <Route path="sources" element={<Sources />} />
            <Route path="visitors" element={<Visitors />} />
            <Route path="pages" element={<PagesReport />} />
            <Route path="products" element={<Products />} />
            <Route path="journeys" element={<Journeys />} />
            <Route path="behaviour" element={<Behaviour />} />
            <Route path="heatmaps" element={<Heatmaps />} />
            <Route path="heatmap" element={<Navigate to="/admin/heatmaps" replace />} />
            <Route path="scroll-depth" element={<ScrollDepth />} />
            <Route path="reports" element={<Reports />} />
            <Route path="enquiries" element={guard('editor', <Enquiries />)} />
            <Route path="customers" element={guard('editor', <Customers />)} />
            <Route path="subscribers" element={guard('editor', <Subscribers />)} />
            <Route path="blog" element={guard('editor', <BlogList />)} />
            <Route path="blog/:id" element={guard('editor', <BlogEditor />)} />
            <Route path="comments" element={guard('editor', <Comments />)} />
            <Route path="settings" element={guard('admin', <Settings />)} />
            <Route path="help" element={<Help />} />
            <Route path="login" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
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
          your role in Settings.
        </p>
      </div>
    </div>
  );
}
