import { useState } from 'react';
import { loginWithPassword } from '../dashboard/firebase.js';

const STAFF_DOMAIN = 'staff.cholanrice.in';

const friendly = (error) => {
  const code = error?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email')) {
    return 'That username or password is not right.';
  }
  if (code.includes('too-many-requests')) return 'Too many tries. Please wait a few minutes and try again.';
  if (code.includes('network')) return 'Could not connect. Check your internet and try again.';
  return 'Could not sign in. Please try again.';
};

// Workers type a username. Behind it is a private address only this system uses.
export default function Login({ state, onSignOut }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const name = username.trim().toLowerCase();
    try {
      await loginWithPassword(name.includes('@') ? name : `${name}@${STAFF_DOMAIN}`, password);
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  };

  if (state.status === 'no-access' || state.status === 'error') {
    return (
      <div className="dash-center">
        <div className="wh-login">
          <img src="/images/cholan-logo.png" alt="Cholan" />
          <h1>{state.status === 'no-access' ? 'No warehouse access' : 'Something went wrong'}</h1>
          <p className="dash-muted">{state.message}</p>
          <button type="button" className="dash-btn dash-btn--wide" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-center">
      <form className="wh-login" onSubmit={submit}>
        <img src="/images/cholan-logo.png" alt="Cholan" />
        <h1>Warehouse</h1>
        <label htmlFor="wh-username">Username</label>
        <input id="wh-username" autoComplete="username" autoCapitalize="none" autoCorrect="off" required value={username} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="wh-password">Password</label>
        <div className="wh-password">
          <input id="wh-password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="dash-link" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        {error && (
          <p className="dash-field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="dash-btn dash-btn--wide" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="dash-muted dash-small">
          Forgot your password? Ask your admin to reset it. Admins sign in at <a href="/dashboard">the dashboard</a>, then come back here.
        </p>
      </form>
    </div>
  );
}
