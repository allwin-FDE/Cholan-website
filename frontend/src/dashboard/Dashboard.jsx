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
import NewPost from '../admin/NewPost.jsx';
import Settings from './pages/Settings.jsx';
import Help from './pages/Help.jsx';
import { Icon } from './ui.jsx';
import { DashContext, can } from './context.js';
import '../styles/dashboard.css';
import '../styles/admin.css';

const NAV = [
  { to: '/admin', label: 'Overview', icon: 'grid', end: true, role: 'viewer' },
  { to: '/admin/visitors', label: 'Visitors', icon: 'users', role: 'viewer' },
  { to: '/admin/pages', label: 'Pages', icon: 'file', role: 'viewer' },
  { to: '/admin/heatmaps', label: 'Heatmaps', icon: 'flame', role: 'viewer' },
  { to: '/admin/enquiries', label: 'Enquiries', icon: 'inbox', role: 'editor' },
  { to: '/admin/subscribers', label: 'Subscribers', icon: 'mail', role: 'editor' },
  { to: '/admin/blog', label: 'Blog', icon: 'pen', role: 'editor' },
  { to: '/admin/comments', label: 'Comments', icon: 'chat', role: 'editor' },
  { to: '/admin/settings', label: 'Settings', icon: 'gear', role: 'admin' },
  { to: '/admin/help', label: 'Help', icon: 'help', role: 'viewer' },
];

const DAYS_KEY = 'cholan-dashboard-days';

// /admin — the shop's own admin: visitors, heatmaps, enquiries, the blog,
// comments and who has access. Sign-in is with Google or an emailed link
// (Login.jsx); the backend decides what each person may see from the access
// list in Settings. Blogs are written and published here, by the admins
// themselves, in the composer (admin/NewPost.jsx).
export default function Dashboard() {
  const [state, setState] = useState({ status: 'loading' }); // loading | signed-out | no-access | ready | error
  const [days, setDaysState] = useState(() => Number(localStorage.getItem(DAYS_KEY)) || 30);
  const [menuOpen, setMenuOpen] = useState(false);
  const [waiting, setWaiting] = useState({ comments: 0 });
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

  // How many comments are waiting, shown on the Comments menu item.
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
    navigate('/admin');
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
  const allowed = (needed) => can(role, needed);
  const guard = (needed, element) => (allowed(needed) ? element : <NoRole needed={needed} role={role} />);

  const context = { user: state.user, role, days, setDays, allowed };

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

  return (
    <DashContext.Provider value={context}>
      <title>Admin · Cholan</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className={`dash${menuOpen ? ' dash--menu' : ''}`}>
        <aside className="dash-side">
          <div className="dash-brand">
            <img src="/images/cholan-logo.png" alt="Cholan" />
            <span>Admin</span>
          </div>
          <nav className="dash-nav" aria-label="Admin">
            {NAV.filter((item) => allowed(item.role)).map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="dash-nav__link">
                <Icon name={item.icon} />
                {item.label}
                {item.to === '/admin/comments' && waiting.comments > 0 && (
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
