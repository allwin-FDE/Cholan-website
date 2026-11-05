import { useEffect, useState } from 'react';
import { finishLogin, googleRedirectResult, isLoginLink, loginWithGoogle, rememberedEmail, sendLoginLink } from './firebase.js';
import { Icon } from './ui.jsx';

// The sign-in screen. No passwords: either a Google account, or an email
// link (enter the address, open the link we send). Whether the person then
// sees anything is up to the access list (Settings).
export default function Login({ state, onSignOut }) {
  const linkInUrl = isLoginLink();
  const [email, setEmail] = useState(rememberedEmail());
  const [step, setStep] = useState(linkInUrl ? 'finishing' : 'ask'); // ask | sending | sent | finishing | confirm
  const [error, setError] = useState('');

  // Opened the emailed link: finish signing in.
  useEffect(() => {
    if (!linkInUrl) return;
    const saved = rememberedEmail();
    if (!saved) {
      // Opened on another device: we need the address once more.
      setStep('confirm');
      return;
    }
    finishLogin(saved)
      .then(() => window.history.replaceState(null, '', '/dashboard'))
      .catch((e) => {
        setError(friendly(e));
        setStep('ask');
      });
  }, [linkInUrl]);

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

  const send = async (event) => {
    event.preventDefault();
    setError('');
    setStep('sending');
    try {
      await sendLoginLink(email.trim().toLowerCase());
      setStep('sent');
    } catch (e) {
      setError(friendly(e));
      setStep('ask');
    }
  };

  const confirm = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await finishLogin(email.trim().toLowerCase());
      window.history.replaceState(null, '', '/dashboard');
    } catch (e) {
      setError(friendly(e));
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
          You’re signed in as <strong>{state.email}</strong>, but this address isn’t on the dashboard’s access list.
        </p>
        <p className="dash-muted">Ask the site owner or an admin to add it in Dashboard → Settings, then reload this page.</p>
        <div className="dash-login__row">
          <button type="button" className="dash-btn" onClick={() => window.location.reload()}>
            <Icon name="refresh" /> Check again
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={onSignOut}>
            Use another email
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
  } else if (step === 'finishing') {
    body = (
      <>
        <div className="dash-spinner" />
        <h1>Signing you in…</h1>
      </>
    );
  } else if (step === 'sent') {
    body = (
      <>
        <div className="dash-login__icon">
          <Icon name="mail" />
        </div>
        <h1>Check your email</h1>
        <p>
          We sent a sign-in link to <strong>{email}</strong>. Open it on this device and you’ll be signed in.
        </p>
        <ul className="dash-login__tips">
          <li>It comes from noreply@cholan-rice-site.firebaseapp.com and arrives within a minute.</li>
          <li>Not there? Look in Spam or Promotions, and mark it “Not spam”.</li>
          <li>The link works once and expires after a few hours.</li>
        </ul>
        <button type="button" className="dash-link" onClick={() => setStep('ask')}>
          Use a different email
        </button>
      </>
    );
  } else {
    const confirming = step === 'confirm';
    body = (
      <>
        <h1>{confirming ? 'Confirm your email' : 'Sign in to the dashboard'}</h1>
        <p className="dash-muted">
          {confirming
            ? 'You opened the link on a different device. Enter the same email address to finish signing in.'
            : 'Use your Google account, or get a sign-in link by email. No password needed.'}
        </p>
        {!confirming && (
          <>
            <button type="button" className="dash-google" onClick={google} disabled={step === 'google'}>
              <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5Z" />
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7Z" />
                <path fill="#FBBC05" d="M10.5 28.6A14.6 14.6 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1Z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48Z" />
              </svg>
              {step === 'google' ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <div className="dash-login__or">
              <span>or get a link by email</span>
            </div>
          </>
        )}
        <form onSubmit={confirming ? confirm : send} className="dash-login__form">
          <label htmlFor="dash-email">Email address</label>
          <input
            id="dash-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="dash-btn dash-btn--wide" disabled={step === 'sending'}>
            {step === 'sending' ? 'Sending…' : confirming ? 'Sign in' : 'Email me a sign-in link'}
            <Icon name="arrow" />
          </button>
        </form>
        <p className="dash-login__note">Only email addresses added in Settings can see the dashboard.</p>
      </>
    );
  }

  return (
    <div className="dash-login">
      <title>Sign in · Cholan Dashboard</title>
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
  if (code.includes('invalid-email')) return 'That email address does not look right.';
  if (code.includes('invalid-action-code') || code.includes('expired')) return 'That sign-in link has expired or was already used. Send a new one.';
  if (code.includes('too-many-requests') || code.includes('quota')) return 'Too many sign-in emails just now. Wait a few minutes and try again.';
  if (code.includes('unauthorized-continue-uri') || code.includes('unauthorized-domain')) return 'Sign-in is not allowed from this address. Use www.cholanrice.in/dashboard.';
  if (code.includes('network')) return 'Could not reach the sign-in service. Check your connection.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'The Google window was closed before signing in. Try again.';
  if (code.includes('operation-not-allowed')) return 'Google sign-in is not switched on yet. Use the email link for now.';
  if (code.includes('account-exists-with-different-credential')) return 'This email already signs in another way. Use the email link instead.';
  return error?.message || 'Could not sign in. Please try again.';
}
