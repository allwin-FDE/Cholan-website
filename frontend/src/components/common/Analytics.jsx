import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsEnabled, initAnalytics, trackPageView } from '../../lib/analytics.js';

// Visit counting on the site: a page view on every route change. Every visitor
// is counted, with no notice or opt-out on the site (the owner's decision,
// 2026-11-14); the privacy policy says so. Renders nothing.
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
