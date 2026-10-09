import { Link } from 'react-router-dom';
import { site } from '../../../config/site.js';
import { whatsappLink } from '../../../lib/whatsapp.js';
import { exploreLinks, socialLinks } from '../storyData.js';

export default function FooterChapter() {
  return (
    <footer className="ch ch--footer" aria-label="Goodness for generations">
      <img
        src="/images/chapter-nandi.webp"
        alt=""
        aria-hidden="true"
        className="sig__nandi"
        loading="lazy"
        decoding="async"
      />
      <div className="sig__inner">
        <span className="sig__rule" aria-hidden="true" />
        <p className="sig__line">Goodness for Generations.</p>
        <nav className="sig__cols" aria-label="Footer">
          <div className="sig__col">
            <h3>Explore</h3>
            <ul>
              {exploreLinks.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="sig__col">
            <h3>Follow</h3>
            <ul>
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="sig__col">
            <h3>Reach us</h3>
            <ul>
              <li>
                <a href={`tel:${site.phoneRaw}`}>{site.phone}</a>
              </li>
              <li>
                <a href={whatsappLink()} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </nav>
        <img
          src="/images/cholan-logo.png"
          alt={site.name}
          className="sig__logo"
          loading="lazy"
        />
      </div>
    </footer>
  );
}
