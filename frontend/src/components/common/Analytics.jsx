import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { analyticsEnabled, getConsent, initAnalytics, setConsent, trackPageView } from '../../lib/analytics.js';

// Opens the banner again, from the footer's "Cookie settings" link.
export const openCookieSettings = () => window.dispatchEvent(new Event('cholan:cookie-settings'));

// Visit counting on the site: a page view on every route change, and the
// cookie notice. Visits are counted unless the visitor turns it off ("Don't
// track me", here or under Cookie settings). Renders nothing while analytics
// is off (no measurement ID, see config/analytics.js).
export default function Analytics() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(null);

  useEffect(() => {
    if (!analyticsEnabled) return;
    initAnalytics();
    setChoice(getConsent());
    if (getConsent() === null) setOpen(true);
    const reopen = () => {
      setChoice(getConsent());
      setOpen(true);
    };
    window.addEventListener('cholan:cookie-settings', reopen);
    return () => window.removeEventListener('cholan:cookie-settings', reopen);
  }, []);

  // React has committed the new page, and with it the page's own <title>.
  useEffect(() => {
    trackPageView();
  }, [pathname]);

  if (!analyticsEnabled || !open || /^\/(dashboard|admin)(\/|$)/.test(pathname)) return null;

  const choose = (next) => {
    setConsent(next);
    setChoice(next);
    setOpen(false);
  };
  const off = choice === 'denied';

  return (
    <div className="cookies" role="region" aria-label="Cookies">
      <p className="cookies__text">
        {off
          ? 'You have turned off tracking on this website. We only count that a visit happened, with no ID and no details. '
          : 'We use cookies to count visits and see how our website is used, so we can make it better. '}
        See our <Link to="/policies/privacy">Privacy Policy</Link>.
      </p>
      <div className="cookies__actions">
        {off ? (
          <>
            <button type="button" className="cookies__btn cookies__btn--ghost" onClick={() => setOpen(false)}>
              Keep it off
            </button>
            <button type="button" className="cookies__btn" onClick={() => choose('granted')}>
              Turn on
            </button>
          </>
        ) : (
          <>
            <button type="button" className="cookies__btn cookies__btn--ghost" onClick={() => choose('denied')}>
              Don’t track me
            </button>
            <button type="button" className="cookies__btn" onClick={() => choose('granted')}>
              OK
            </button>
          </>
        )}
      </div>
    </div>
  );
}
