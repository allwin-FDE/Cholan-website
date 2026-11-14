import { useEffect, useState } from 'react';
import { googleRedirectResult, loginWithGoogle } from './firebase.js';
import { Icon } from './ui.jsx';

// The sign-in screen: a Google account only, no passwords or emailed links.
// Whether the person then sees anything is up to the access list (Settings).
export default function Login({ state, onSignOut }) {
  const [step, setStep] = useState('ask'); // ask | google
  const [error, setError] = useState('');

  // Back from a Google sign-in that went by redirect: show any error here.
  useEffect(() => {
    googleRedirectResult().catch((e) => setError(friendly(e)));
  }, []);

  const google = async () => {
    setError('');
    setStep('google');
    try {
      await loginWithGoogle();
    } catch (e) {
      setError(friendly(e));
      setStep('ask');
    }
  };

  let body;
  if (state.status === 'no-access') {
    body = (
      <>
        <div className="dash-login__icon dash-login__icon--warn">
          <Icon name="lock" />
        </div>
        <h1>No access yet</h1>
        <p>
          You’re signed in as <strong>{state.email}</strong>, but this address isn’t on the admin’s access list.
        </p>
        <p className="dash-muted">Ask the site owner or an admin to add it in Admin → Settings, then reload this page.</p>
        <div className="dash-login__row">
          <button type="button" className="dash-btn" onClick={() => window.location.reload()}>
            <Icon name="refresh" /> Check again
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onSignOut}>
            Use another account
          </button>
        </div>
      </>
    );
  } else if (state.status === 'error') {
    body = (
      <>
        <h1>Something went wrong</h1>
        <p>{state.message}</p>
        <div className="dash-login__row">
          <button type="button" className="dash-btn" onClick={() => window.location.reload()}>
            Try again
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h1>Sign in to the admin</h1>
        <p className="dash-muted">Use your Google account. No password needed.</p>
        <button type="button" className="dash-google" onClick={google} disabled={step === 'google'}>
          <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7Z" />
            <path fill="#FBBC05" d="M10.5 28.6A14.6 14.6 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1Z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48Z" />
          </svg>
          {step === 'google' ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <p className="dash-login__note">Only Google accounts added in Settings can open the admin.</p>
      </>
    );
  }

  return (
    <div className="dash-login">
      <title>Sign in · Cholan Admin</title>
      <meta name="robots" content="noindex, nofollow" />
      <div className="dash-login__card">
        <img className="dash-login__logo" src="/images/cholan-logo.png" alt="Cholan Rice and Millet Shop" />
        {error && (
          <div className="dash-error" role="alert">
            {error}
          </div>
        )}
        {body}
      </div>
    </div>
  );
}

function friendly(error) {
  const code = error?.code || '';
  if (code.includes('unauthorized-domain')) return 'Sign-in is not allowed from this address. Use www.cholanrice.in/admin.';
  if (code.includes('network')) return 'Could not reach the sign-in service. Check your connection.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'The Google window was closed before signing in. Try again.';
  if (code.includes('too-many-requests')) return 'Too many sign-in attempts just now. Wait a few minutes and try again.';
  if (code.includes('account-exists-with-different-credential')) {
    return 'This email address was first set up with an emailed link, so Google cannot sign it in yet. Ask your developer to switch it to Google.';
  }
  return error?.message || 'Could not sign in. Please try again.';
}
