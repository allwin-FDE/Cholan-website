import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { analyticsEnabled, getConsent, initAnalytics, setConsent, trackPageView } from '../../lib/analytics.js';

// Opens the banner again, from the footer's "Cookie settings" link.
export const openCookieSettings = () => window.dispatchEvent(new Event('cholan:cookie-settings'));

// Google Analytics on the site: a page view on every route change, and the
// cookie banner that asks first. Renders nothing while analytics is off
// (no measurement ID yet, see config/analytics.js).
export default function Analytics() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!analyticsEnabled) return;
    initAnalytics();
    if (getConsent() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener('cholan:cookie-settings', reopen);
    return () => window.removeEventListener('cholan:cookie-settings', reopen);
  }, []);

  // React has committed the new page, and with it the page's own <title>.
  useEffect(() => {
    trackPageView();
  }, [pathname]);

  if (!analyticsEnabled || !open || /^\/(dashboard|admin)(\/|$)/.test(pathname)) return null;

  const choose = (choice) => {
    setConsent(choice);
    setOpen(false);
  };

  return (
    <div className="cookies" role="region" aria-label="Cookie choice">
      <p className="cookies__text">
        We use cookies to see how visitors use our website, so we can make it better. See our{' '}
        <Link to="/policies/privacy">Privacy Policy</Link>.
      </p>
      <div className="cookies__actions">
        <button type="button" className="cookies__btn cookies__btn--ghost" onClick={() => choose('denied')}>
          Reject
        </button>
        <button type="button" className="cookies__btn" onClick={() => choose('granted')}>
          Accept
        </button>
      </div>
    </div>
  );
}
