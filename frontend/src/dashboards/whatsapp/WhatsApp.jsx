import { useCallback, useEffect, useState } from 'react';
import { SideToggle, useSideHidden } from '../shared/sidebar.jsx';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../shared/api.js';
import { logout, watchUser } from '../shared/firebase.js';
import Login from '../shared/Login.jsx';
import { Icon } from '../shared/ui.jsx';
import { DashContext, can } from '../shared/context.js';
import { AreaElsewhere, opensArea } from '../shared/area.jsx';
import { wa } from './api.js';
import { WaContext } from './shared.jsx';
import Overview from './pages/Overview.jsx';
import Inbox from './pages/Inbox.jsx';
import Campaigns from './pages/Campaigns.jsx';
import Templates from './pages/Templates.jsx';
import Contacts from './pages/Contacts.jsx';
import Automations from './pages/Automations.jsx';
import BulkMessage from './pages/BulkMessage.jsx';
import Bot from './pages/Bot.jsx';
import Reports from './pages/Reports.jsx';
import Connection from './pages/Connection.jsx';
import Help from './pages/Help.jsx';
import '../styles/dashboard.css';
import '../styles/whatsapp.css';
import '../styles/whatsapp-theme.css';

// /whatsapp: WhatsApp campaigns through Meta's WhatsApp Cloud API. Templates
// (made here, approved by Meta), contacts and their consent, campaigns sent
// to an audience on a schedule, the inbox for replies, automations (keyword
// replies, order and enquiry messages) and the number's health. Same Google
// sign-in as /admin; a person needs the WhatsApp app in Settings.
const NAV = [
  { to: '/whatsapp', label: 'Overview', icon: 'grid', end: true },
  { to: '/whatsapp/inbox', label: 'Inbox', icon: 'chat' },
  { to: '/whatsapp/contacts', label: 'Contacts', icon: 'users' },
  { to: '/whatsapp/templates', label: 'Templates', icon: 'file' },
  { to: '/whatsapp/bulk', label: 'Bulk message', icon: 'mail' },
  { to: '/whatsapp/campaigns', label: 'Broadcasts', icon: 'bolt' },
  { to: '/whatsapp/automations', label: 'Automations', icon: 'route' },
  { to: '/whatsapp/bot', label: 'Bot', icon: 'pulse' },
  { to: '/whatsapp/reports', label: 'Reports', icon: 'download' },
  { to: '/whatsapp/connection', label: 'Settings', icon: 'gear' },
  { to: '/whatsapp/help', label: 'Help', icon: 'help' },
];

export default function WhatsApp() {
  const [state, setState] = useState({ status: 'loading' });
  const [status, setStatus] = useState(null);
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideHidden, toggleSide] = useSideHidden();
  const { pathname } = useLocation();
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

  const allowedHere = state.status === 'ready' && opensArea(state.user, 'whatsapp');
  const reloadStatus = useCallback(() => wa.status().then(setStatus).catch((e) => setStatus({ error: e.message })), []);
  useEffect(() => {
    if (allowedHere) reloadStatus();
  }, [allowedHere, reloadStatus]);
  // The unread count on Inbox, every 30 seconds.
  useEffect(() => {
    if (!allowedHere) return undefined;
    const load = () => wa.inbox().then((d) => setUnread(d.conversations.reduce((s, c) => s + (c.unread || 0), 0))).catch(() => {});
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    return () => clearInterval(t);
  }, [allowedHere, pathname]);

  const signOut = async () => {
    await logout();
    navigate('/whatsapp');
  };

  if (state.status === 'loading') {
    return (
      <div className="dash-center">
        <div className="dash-spinner" aria-label="Loading" />
      </div>
    );
  }
  if (state.status !== 'ready') return <Login state={state} onSignOut={signOut} />;
  if (!allowedHere) return <AreaElsewhere user={state.user} here="whatsapp" onSignOut={signOut} />;

  const { role, email } = state.user;
  const allowed = (needed) => can(role, needed);
  const context = { user: state.user, role, days: 30, setDays: () => {}, allowed, base: '/whatsapp' };
  const conn = status?.connection;

  return (
    <DashContext.Provider value={context}>
      <WaContext.Provider value={{ status, reloadStatus }}>
        <title>WhatsApp · Cholan</title>
        <meta name="robots" content="noindex, nofollow" />
        <div className={`dash wa${menuOpen ? ' dash--menu' : ''}${sideHidden ? ' dash--hidden' : ''}`}>
          <aside className="dash-side">
            <div className="dash-brand">
              <span className="wa-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Zm4.7 12.6c-.2.6-1.2 1.1-1.7 1.2-.4 0-.9.1-3-.7-2.6-1-4.2-3.6-4.3-3.8-.1-.2-1-1.4-1-2.6 0-1.3.7-1.9.9-2.1.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.7-.1 1.2Z" />
                </svg>
              </span>
              <span>WhatsApp</span>
            </div>
            <nav className="dash-nav" aria-label="WhatsApp">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="dash-nav__link">
                  <Icon name={item.icon} />
                  {item.label}
                  {item.to === '/whatsapp/inbox' && unread > 0 && (
                    <span className="dash-nav__count" aria-label={`${unread} unread`}>
                      {unread}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="dash-side__foot">
              {opensArea(state.user, 'website') && (
                <a href="/admin" className="dash-nav__link">
                  <Icon name="globe" />
                  Website admin
                </a>
              )}
              {opensArea(state.user, 'plant') && (
                <a href="/warehouse" className="dash-nav__link">
                  <Icon name="truck" />
                  Plant dashboard
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
          <SideToggle hidden={sideHidden} onToggle={toggleSide} />
          <div className="dash-scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />
          <div className="dash-main">
            <header className="dash-mobilebar">
              <button type="button" className="dash-icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                <Icon name="menu" />
              </button>
              <strong>WhatsApp</strong>
              <span />
            </header>
            {conn && !conn.ready && pathname !== '/whatsapp/connection' && (
              <div className="wa-banner">
                <strong>WhatsApp isn’t connected yet.</strong> You can set everything up; sending starts once Meta’s details are in.{' '}
                <Link to="/whatsapp/connection">See what’s needed</Link>
              </div>
            )}
            {conn?.fake && (
              <div className="wa-banner wa-banner--test">
                <strong>Test mode:</strong> nothing is sent to WhatsApp; Meta’s answers are simulated.
              </div>
            )}
            <Routes>
              <Route index element={<Overview />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="templates" element={<Templates />} />
              <Route path="contacts" element={<Contacts />} />
              <Route path="automations" element={<Automations />} />
              <Route path="bulk" element={<BulkMessage />} />
              <Route path="broadcasts" element={<Navigate to="/whatsapp/campaigns" replace />} />
              <Route path="bot" element={<Bot />} />
              <Route path="reports" element={<Reports />} />
              <Route path="connection" element={<Connection />} />
              <Route path="help" element={<Help />} />
              <Route path="*" element={<Navigate to="/whatsapp" replace />} />
            </Routes>
          </div>
        </div>
      </WaContext.Provider>
    </DashContext.Provider>
  );
}
