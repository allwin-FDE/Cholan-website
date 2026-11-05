import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../../config/site.js';
import { whatsappLink } from '../../lib/whatsapp.js';
import AboutIcon from './AboutIcon.jsx';
import splitWords from './splitWords.jsx';
import useAboutAnimations from './useAboutAnimations.js';
import { values, milestones, directionsUrl } from './data.js';
import Seo from '../../components/common/Seo.jsx';
import { pages, businessSchema } from '../../config/seo.js';

// /about (original `wm`).
export default function About() {
  const rootRef = useRef(null);
  useAboutAnimations(rootRef);

  return (
    <div className="ab" ref={rootRef}>
      <Seo {...pages.about} schema={businessSchema} />
      <section className="ab-quote">
        <div className="container">
          <div className="ab-quote__mark" aria-hidden="true">
            <span className="ab-quote__rule" />
            <span className="ab-quote__glyph">“</span>
            <span className="ab-quote__rule" />
          </div>
          <h1 className="ab-quote__text ab-rise">
            <span className="ab-quote__line">{splitWords('Every grain holds a story.')}</span>
            <span className="ab-quote__line">{splitWords('Every meal creates a memory.')}</span>
          </h1>
          <div className="ab-quote__divider" aria-hidden="true">
            <span />
          </div>
          <p className="ab-quote__caption" data-reveal>
            From the fields that nurture our grains to the homes that cherish them, Cholan preserves
            the connection between tradition, taste, and togetherness.
          </p>
        </div>
      </section>

      <section className="ab-promise">
        <div className="container">
          <div className="ab-promise__card">
            <header className="ab-promise__head">
              <span className="ab-promise__mark" aria-hidden="true" lang="ta">
                சோழன்
              </span>
              <h2 className="ab-rise">
                <span className="ab-promise__line">{splitWords('The wisdom of yesterday.')}</span>
                <span className="ab-promise__line">{splitWords('The goodness of tomorrow.')}</span>
              </h2>
              <p data-reveal>
                For generations, grains have been chosen with care. We continue that tradition by
                combining age-old knowledge with modern quality practices.
              </p>
            </header>
            <ul className="ab-promise__list">
              {values.map((value) => (
                <li className="ab-value" data-reveal key={value.title}>
                  <h3>{value.title}</h3>
                  <p>{value.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="ab-journey">
        <div className="container">
          <header className="ab-journey__head">
            <h2 className="ab-rise">{splitWords('How we got here.')}</h2>
          </header>
          <div className="ab-spine">
            <span className="ab-spine__track" aria-hidden="true">
              <span className="ab-spine__fill" />
            </span>
            <ol className="ab-spine__list">
              {milestones.map((milestone, index) => (
                <li
                  className={`ab-stop ab-stop--${index % 2 ? 'right' : 'left'}`}
                  key={milestone.year}
                >
                  <span className="ab-stop__dot" aria-hidden="true" />
                  <div className="ab-stop__card">
                    <span className="ab-stop__year">{milestone.year}</span>
                    <h3>{milestone.title}</h3>
                    <p>{milestone.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="ab-products">
        <div className="container ab-products__inner">
          <div className="ab-products__copy">
            <h2 className="ab-rise">
              <span className="ab-products__line">{splitWords('Packed fresh,')}</span>
              <span className="ab-products__line">{splitWords('against the order.')}</span>
            </h2>
            <div className="ab-products__rule" aria-hidden="true">
              <span />
            </div>
            <p data-reveal>
              Every bag from Cholan Rice and Millet Shop is packed against the order rather than stored, so
              you enjoy the same freshness we trust at home — from household packs to 26 kg bags for
              messes and caterers.
            </p>
            <Link to="/products" className="ab-btn ab-btn--dark" data-reveal>
              View All Products <AboutIcon name="arrow" />
            </Link>
          </div>
        </div>
      </section>

      <section className="ab-visit">
        <div className="container">
          <div className="ab-visit__panel">
            <div className="ab-visit__copy">
              <h2 className="ab-rise">{splitWords('Come see the mill.')}</h2>
              <p data-reveal>
                We’re happy to show you our process, our standards, and the care that goes into
                every pack. Call ahead and we will set aside the time.
              </p>
              <div className="ab-visit__actions" data-reveal>
                <a href={`tel:+${site.phoneRaw}`} className="ab-btn ab-btn--dark">
                  <AboutIcon name="phone" /> {site.phone}
                </a>
                <a
                  href={whatsappLink()}
                  target="_blank"
                  rel="noreferrer"
                  className="ab-btn ab-btn--outline"
                >
                  <AboutIcon name="chat" /> WhatsApp <AboutIcon name="arrow" />
                </a>
              </div>
            </div>
            <ul className="ab-visit__cards">
              <li data-reveal>
                <AboutIcon name="pin" className="ab-visit__icon" />
                <div>
                  <span className="ab-visit__label">Our office</span>
                  <p>
                    {site.address.line1}
                    <br />
                    {site.address.line2} {site.address.pincode}
                    <br />
                    {site.address.state}
                  </p>
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ab-visit__link"
                  >
                    Get directions
                  </a>
                </div>
              </li>
              <li data-reveal>
                <AboutIcon name="mail" className="ab-visit__icon" />
                <div>
                  <span className="ab-visit__label">Email</span>
                  <p>
                    <a href={`mailto:${site.email}`} className="ab-visit__link">
                      {site.email}
                    </a>
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
