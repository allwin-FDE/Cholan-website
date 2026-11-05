import { useState } from 'react';
import { loginWithPassword } from '../dashboard/firebase.js';

const friendly = (error) => {
  const code = error?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-email')) {
    return 'That email or password is not right.';
  }
  if (code.includes('too-many-requests')) return 'Too many tries. Please wait a few minutes and try again.';
  if (code.includes('network')) return 'Could not connect. Check your internet and try again.';
  return 'Could not sign in. Please try again.';
};

export default function Login({ state, onSignOut }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await loginWithPassword(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  };

  return (
    <div className="adm-center">
      <div className="adm-login">
        <img src="/images/cholan-logo.png" alt="Cholan" />
        {state.status === 'no-access' || state.status === 'error' ? (
          <>
            <h1>{state.status === 'error' ? 'Something went wrong' : 'This login has no access'}</h1>
            <p>{state.message}</p>
            <button type="button" className="adm-btn adm-btn--wide" onClick={onSignOut}>
              Use another login
            </button>
          </>
        ) : (
          <>
            <h1>Share a post</h1>
            <p>Sign in to post photos to the Cholan blog.</p>
            {error && (
              <div className="dash-error" role="alert">
                {error}
              </div>
            )}
            <form onSubmit={submit}>
              <label htmlFor="adm-email">Email</label>
              <input id="adm-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              <label htmlFor="adm-password">Password</label>
              <div className="adm-password">
                <input
                  id="adm-password"
                  type={show ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShow(!show)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
              <button type="submit" className="adm-btn adm-btn--wide" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
