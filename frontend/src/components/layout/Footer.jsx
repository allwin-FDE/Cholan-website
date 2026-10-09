import { Link } from 'react-router-dom';
import { site } from '../../config/site.js';
import { footerNav, policyNav } from '../../config/navigation.js';
import { categories } from '../../data/categories.js';
import { Icon, iconPaths } from '../common/Icon.jsx';

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
              Bringing the finest rice and millets from the fertile lands of the Chola region to
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
                  <Link to={`/products?category=${category.slug}`}>{category.name}</Link>
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
            <form
              className="footer__form"
              onSubmit={(e) => {
                e.preventDefault();
                alert('Newsletter signup — connect this to your mailing list.');
              }}
            >
              <input type="email" required placeholder="Enter your email" aria-label="Email address" />
              <button type="submit" aria-label="Subscribe">
                <Icon d={iconPaths.arrow} />
              </button>
            </form>
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
          <span>
            © {new Date().getFullYear()} {site.name}. All rights reserved.
          </span>
          <nav className="footer__legal" aria-label="Policies">
            {policyNav.map((link) => (
              <Link key={link.to} to={link.to}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
