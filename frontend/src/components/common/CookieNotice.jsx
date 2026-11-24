import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

// A one-time note that the site uses cookies to count visits (the owner's
// decision, 2026-11-24, after the website audit; the DPDP Act). Counting runs
// for everyone, as before; "OK" just hides the note on this browser. Not shown
// in the dashboards.
const KEY = 'cholan-cookie-notice';

function seen() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export default function CookieNotice() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    // After the page has settled, so it never lands in a saved (prerendered) page.
    const t = setTimeout(() => setShow(!seen()), 1500);
    return () => clearTimeout(t);
  }, []);
  if (!show || /^\/(admin|dashboard|warehouse|whatsapp)(\/|$)/.test(pathname)) return null;
  const ok = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* private window: it shows again next visit */
    }
    setShow(false);
  };
  return (
    <div className="cookie-note" role="region" aria-label="Cookies">
      <p>
        We use cookies to count visits and improve this website. <Link to="/policies/privacy">Privacy Policy</Link>
      </p>
      <button type="button" className="btn btn--primary btn--sm" onClick={ok}>
        OK
      </button>
    </div>
  );
}
