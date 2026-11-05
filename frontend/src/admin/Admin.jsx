import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { api } from '../dashboard/api.js';
import { logout, watchUser } from '../dashboard/firebase.js';
import Login from './Login.jsx';
import Home from './Home.jsx';
import NewPost from './NewPost.jsx';
import '../styles/dashboard.css';
import '../styles/admin.css';

// /admin — the simple posting page: pick photos, write a caption, send for
// approval. Everything else about the site is in /dashboard, which this
// login cannot open; the backend decides that from its role (lib/auth.js).
export default function Admin() {
  const [state, setState] = useState({ status: 'loading' }); // loading | signed-out | no-access | ready | error

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
          setState({ status: error.code === 'no-access' ? 'no-access' : 'error', message: error.message });
        }
        return undefined;
      }),
    [],
  );

  return (
    <div className="adm">
      <title>Post · Cholan</title>
      <meta name="robots" content="noindex, nofollow" />
      {state.status === 'loading' && (
        <div className="adm-center">
          <div className="dash-spinner" aria-label="Loading" />
        </div>
      )}
      {state.status !== 'loading' && state.status !== 'ready' && <Login state={state} onSignOut={logout} />}
      {state.status === 'ready' && (
        <Routes>
          <Route index element={<Home onSignOut={logout} />} />
          <Route path="new" element={<NewPost />} />
          <Route path="edit/:id" element={<NewPost />} />
          <Route path="*" element={<Home onSignOut={logout} />} />
        </Routes>
      )}
    </div>
  );
}
