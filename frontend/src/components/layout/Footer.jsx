import { useState } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../../config/site.js';
import { footerNav, policyNav } from '../../config/navigation.js';
import { categories } from '../../data/categories.js';
import { Icon, iconPaths } from '../common/Icon.jsx';
import { openCookieSettings } from '../common/Analytics.jsx';
import { analyticsEnabled, track } from '../../lib/analytics.js';
import { hasBackend, subscribe } from '../../lib/api.js';
import { enquiryContext } from '../../lib/tracker.js';

const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${site.address.line1}, ${site.address.line2} ${site.address.pincode}`)}`;

// Site footer (original `lr`).
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__main">
        <div className="container footer__grid">
          <div className="footer__brand">
            <Link to="/" className="footer__logo" aria-label={`${site.name} home`}>
              <img
                src="/images/cholan-logo.png"
                alt={site.name}
                width="404"
                height="200"
                loading="lazy"
              />
            </Link>
            <span className="footer__motto">Pure Goodness Always</span>
            <p>
              Bringing the finest rice from the fertile lands of the Chola region to
              homes across India.
            </p>
          </div>
          <nav className="footer__col" aria-label="Quick links">
            <h4>Quick Links</h4>
            <ul>
              {footerNav.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav className="footer__col" aria-label="Our products">
            <h4>Our Products</h4>
            <ul>
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link to={`/${category.slug}`}>{category.name}</Link>
                </li>
              ))}
              <li>
                <Link to="/products">All Products</Link>
              </li>
            </ul>
          </nav>
          <div className="footer__col">
            <h4>Contact Us</h4>
            <ul className="footer__contact">
              <li>
                <Icon d={iconPaths.phone} />
                <a href={`tel:${site.phoneRaw}`}>{site.phone}</a>
              </li>
              <li>
                <Icon d={iconPaths.mail} />
                <a href={`mailto:${site.email}`}>{site.email}</a>
              </li>
              <li>
                <Icon d={iconPaths.pin} />
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  {site.address.line1}, {site.address.line2} – {site.address.pincode}
                </a>
              </li>
            </ul>
          </div>
          <div className="footer__col footer__news">
            <h4>Subscribe to Updates</h4>
            <p>Get the latest on our products, offers and stories from the Chola land.</p>
            <Subscribe />
            <h4 className="footer__follow">Follow Us</h4>
            <div className="footer__social">
              <a href={site.social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook">
                <Icon d={iconPaths.facebook} />
              </a>
              <a href={site.social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram">
                <Icon d={iconPaths.instagram} />
              </a>
              <a href={site.social.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn">
                <Icon d={iconPaths.linkedin} />
              </a>
            </div>
          </div>
        </div>
        <div className="footer__rule" aria-hidden="true">
          <span />
        </div>
        <div className="container footer__bar">
          <span className="footer__copy">
            © {new Date().getFullYear()} {site.name}. All rights reserved.
            <span className="footer__reg">
              <span>A brand of {site.legalName}</span>
            </span>
            <span className="footer__reg">
              {site.cin && <span>CIN {site.cin}</span>}
              {site.gstin && <span>GSTIN {site.gstin}</span>}
              {site.fssai && <span>FSSAI Lic. No. {site.fssai}</span>}
            </span>
          </span>
          <nav className="footer__legal" aria-label="Policies">
            {policyNav.map((link) => (
              <Link key={link.to} to={link.to}>
                {link.label}
              </Link>
            ))}
            {analyticsEnabled && (
              <button type="button" onClick={openCookieSettings}>
                Cookie settings
              </button>
            )}
          </nav>
        </div>
      </div>
    </footer>
  );
}

// The "Subscribe to Updates" box. Saves the address to the subscriber list
// (dashboard → Subscribers) and says so in place of the box. Without a
// backend it opens an email to the shop instead.
function Subscribe() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle | sending | done | error

  const onSubmit = async (e) => {
    e.preventDefault();
    const address = email.trim();
    if (!hasBackend) {
      window.location.href = `mailto:${site.email}?subject=${encodeURIComponent('Subscribe to updates')}&body=${encodeURIComponent(address)}`;
      return;
    }
    setState({ status: 'sending' });
    try {
      const result = await subscribe(address, { ...enquiryContext(), page: window.location.pathname });
      setState({ status: 'done', already: result.already });
      if (!result.already) track('newsletter_signup', { method: 'footer' });
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  };

  if (state.status === 'done') {
    return (
      <p className="footer__thanks" role="status">
        {state.already ? 'You’re already subscribed — thank you!' : 'Thank you! You’re subscribed to our updates.'}
      </p>
    );
  }

  return (
    <>
      <form className="footer__form" onSubmit={onSubmit}>
        <input
          type="email"
          required
          placeholder="Enter your email"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state.status === 'sending'}
        />
        <button type="submit" aria-label="Subscribe" disabled={state.status === 'sending'}>
          <Icon d={iconPaths.arrow} />
        </button>
      </form>
      {state.status === 'error' && (
        <p className="footer__form-error" role="alert">
          {state.message}
        </p>
      )}
    </>
  );
}
