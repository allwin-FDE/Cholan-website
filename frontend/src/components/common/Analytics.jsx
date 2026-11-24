import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsEnabled, initAnalytics, trackPageView } from '../../lib/analytics.js';

// Visit counting on the site: a page view on every route change. Every visitor
// is counted (the owner's decision, 2026-11-14); since 2026-11-24 a one-time
// note says so (CookieNotice.jsx), as does the privacy policy. Renders nothing.
export default function Analytics() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (analyticsEnabled) initAnalytics();
  }, []);

  // React has committed the new page, and with it the page's own <title>.
  useEffect(() => {
    trackPageView();
  }, [pathname]);

  return null;
}
