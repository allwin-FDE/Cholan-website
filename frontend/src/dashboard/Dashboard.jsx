import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { logout, watchUser } from './firebase.js';
import Login from './Login.jsx';
import Overview from './pages/Overview.jsx';
import Visitors from './pages/Visitors.jsx';
import PagesReport from './pages/PagesReport.jsx';
import Heatmaps from './pages/Heatmaps.jsx';
import Enquiries from './pages/Enquiries.jsx';
import Subscribers from './pages/Subscribers.jsx';
import BlogList from './pages/BlogList.jsx';
import Comments from './pages/Comments.jsx';
import BlogEditor from './pages/BlogEditor.jsx';
import Settings from './pages/Settings.jsx';
import Help from './pages/Help.jsx';
import { Icon } from './ui.jsx';
import { DashContext, can } from './context.js';
import '../styles/dashboard.css';
import '../styles/admin.css';

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: 'grid', end: true, role: 'viewer' },
  { to: '/dashboard/visitors', label: 'Visitors', icon: 'users', role: 'viewer' },
  { to: '/dashboard/pages', label: 'Pages', icon: 'file', role: 'viewer' },
  { to: '/dashboard/heatmaps', label: 'Heatmaps', icon: 'flame', role: 'viewer' },
  { to: '/dashboard/enquiries', label: 'Enquiries', icon: 'inbox', role: 'editor' },
  { to: '/dashboard/subscribers', label: 'Subscribers', icon: 'mail', role: 'editor' },
  { to: '/dashboard/blog', label: 'Blog', icon: 'pen', role: 'editor' },
  { to: '/dashboard/comments', label: 'Comments', icon: 'chat', role: 'editor' },
  { to: '/dashboard/settings', label: 'Settings', icon: 'gear', role: 'admin' },
  { to: '/dashboard/help', label: 'Help', icon: 'help', role: 'viewer' },
];

const DAYS_KEY = 'cholan-dashboard-days';

// /dashboard — the shop's own dashboard: visitors, heatmaps, enquiries, blog
// and who has access. Sign-in is by an emailed link (Login.jsx); the backend
// decides what each person may see from the access list in Settings.
export default function Dashboard() {
  const [state, setState] = useState({ status: 'loading' }); // loading | signed-out | no-access | ready | error
  const [days, setDaysState] = useState(() => Number(localStorage.getItem(DAYS_KEY)) || 30);
  const [menuOpen, setMenuOpen] = useState(false);
  const [waiting, setWaiting] = useState({ count: 0, comments: 0 });
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const setDays = (value) => {
    setDaysState(value);
    localStorage.setItem(DAYS_KEY, String(value));
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
          const me = await api.me();
          setState({ status: 'ready', user: me });
        } catch (error) {
          if (error.code === 'no-access') setState({ status: 'no-access', email: user.email, message: error.message });
          else setState({ status: 'error', message: error.message });
        }
      }),
    [],
  );

  useEffect(() => setMenuOpen(false), [pathname]);

  // How many short posts are waiting, shown on the Blog menu item.
  const canReview = state.status === 'ready' && can(state.user.role, 'editor');
  useEffect(() => {
    if (!canReview) return undefined;
    const refresh = () => api.reviewCount().then(setWaiting).catch(() => {});
    refresh();
    window.addEventListener('cholan:review', refresh);
    return () => window.removeEventListener('cholan:review', refresh);
  }, [canReview, pathname]);

  const signOut = async () => {
    await logout();
    navigate('/dashboard');
  };

  if (state.status === 'loading') {
    return (
      <div className="dash-center">
        <div className="dash-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (state.status !== 'ready') {
    return <Login state={state} onSignOut={signOut} />;
  }

  const { role, email } = state.user;
  // The shared posting login has its own page, and nothing here.
  if (role === 'poster') return <Navigate to="/admin" replace />;
  const allowed = (needed) => can(role, needed);
  const guard = (needed, element) => (allowed(needed) ? element : <NoRole needed={needed} role={role} />);

  return (
    <DashContext.Provider value={{ user: state.user, role, days, setDays, allowed }}>
      <title>Dashboard · Cholan</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className={`dash${menuOpen ? ' dash--menu' : ''}`}>
        <aside className="dash-side">
          <div className="dash-brand">
            <img src="/images/cholan-logo.png" alt="Cholan" />
            <span>Dashboard</span>
          </div>
          <nav className="dash-nav" aria-label="Dashboard">
            {NAV.filter((item) => allowed(item.role)).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="dash-nav__link">
                <Icon name={item.icon} />
                {item.label}
                {item.to === '/dashboard/blog' && waiting.count > 0 && (
                  <span className="dash-nav__count" aria-label={`${waiting.count} waiting for approval`}>
                    {waiting.count}
                  </span>
                )}
                {item.to === '/dashboard/comments' && waiting.comments > 0 && (
                  <span className="dash-nav__count" aria-label={`${waiting.comments} waiting for approval`}>
                    {waiting.comments}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="dash-side__foot">
            {allowed('admin') && (
              <a href="/warehouse" className="dash-nav__link">
                <Icon name="external" />
                Warehouse
              </a>
            )}
            <a href="/" target="_blank" rel="noreferrer" className="dash-nav__link">
              <Icon name="external" />
              Open website
            </a>
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
            <Route index element={<Overview />} />
            <Route path="visitors" element={<Visitors />} />
            <Route path="pages" element={<PagesReport />} />
            <Route path="heatmaps" element={<Heatmaps />} />
            <Route path="enquiries" element={guard('editor', <Enquiries />)} />
            <Route path="subscribers" element={guard('editor', <Subscribers />)} />
            <Route path="blog" element={guard('editor', <BlogList />)} />
            <Route path="blog/new" element={guard('editor', <BlogEditor />)} />
            <Route path="blog/:id" element={guard('editor', <BlogEditor />)} />
            <Route path="comments" element={guard('editor', <Comments />)} />
            <Route path="settings" element={guard('admin', <Settings />)} />
            <Route path="help" element={<Help />} />
            <Route path="login" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
