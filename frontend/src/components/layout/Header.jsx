import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { site } from '../../config/site.js';
import { features } from '../../config/features.js';
import { mainNav } from '../../config/navigation.js';
import CartButton from '../common/CartButton.jsx';

// Sticky site header + mobile nav (original `rr`). On the home page it starts "ghost"
// (transparent over the hero) and turns solid after scrolling ~20% of the viewport.
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const closeMenu = () => setMenuOpen(false);

  // Publish the header height as the --header-h CSS variable.
  useEffect(() => {
    const header = document.querySelector('.header');
    if (!header) return;
    const update = () => {
      const height = Math.round(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--header-h', `${height}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const threshold = () => (isHome ? window.innerHeight * 0.2 : 12);
    const update = () => setScrolled(window.scrollY > threshold());
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [isHome]);

  return (
    <>
      <header
        className={['header', scrolled ? 'header--scrolled' : '', isHome && !scrolled && !menuOpen ? 'header--ghost' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="container header__inner">
          <Link to="/" className="brand" aria-label={`${site.name} home`} onClick={closeMenu}>
            <img
              className="brand__logo"
              src="/images/cholan-logo.png"
              alt={site.name}
              width="404"
              height="200"
            />
          </Link>
          <nav className={`nav${menuOpen ? ' nav--open' : ''}`}>
            {mainNav.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={closeMenu}
                className={({ isActive }) => `nav__link${isActive ? ' nav__link--active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="header__tools">
            {features.cart && !isHome && <CartButton />}
            <button
              className="hamburger"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>
      {menuOpen && <div className="nav-backdrop" onClick={closeMenu} aria-hidden="true" />}
    </>
  );
}
