import { GA_ID } from '../config/analytics.js';
import { notePage, startTracking, trackEvent } from './tracker.js';

// Google Analytics 4 and the site's own visit counting (lib/tracker.js), for
// every visitor, with no notice or opt-out on the site (the owner's decision,
// 2026-11-14; the privacy policy says so). Ads features stay off: this is for
// measuring the site only.

// Choices saved by the old cookie notices are no longer used.
try {
  localStorage.removeItem('cholan-consent');
  localStorage.removeItem('cholan-tracking');
} catch {
  // Storage blocked: nothing saved to forget.
}

// Off without an ID, and off for automated browsers, so the build's page
// snapshots (scripts/prerender.mjs) carry no banner and send no visits. Off
// inside a frame too: the dashboard's heatmap preview shows site pages, and
// those views are the shop's own, not visits.
export const analyticsEnabled =
  Boolean(GA_ID) && typeof navigator !== 'undefined' && !navigator.webdriver && window.top === window.self;

let loaded = false;

function gtag() {
  window.dataLayer.push(arguments);
}

function load() {
  if (loaded || !analyticsEnabled) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = gtag;
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  gtag('js', new Date());
  // Page views are sent by hand on each route change (trackPageView), since
  // the site changes pages without reloading.
  gtag('config', GA_ID, { send_page_view: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(script);
  document.addEventListener('click', trackLinkClick, true);
  startTracking();
}

// Called once at start-up: every visitor is measured.
export function initAnalytics() {
  if (analyticsEnabled) load();
}

const active = () => loaded;

// The admin and warehouse are the shop's own tools, not part of the site's visits.
const inDashboard = () => /^\/(dashboard|admin|warehouse)(\/|$)/.test(location.pathname);

export function trackPageView() {
  if (inDashboard()) return;
  notePage(location.pathname, document.title);
  if (!active()) return;
  gtag('event', 'page_view', {
    page_location: location.href,
    page_path: location.pathname,
    page_title: document.title,
  });
}

export function track(event, params = {}) {
  if (!active() || inDashboard()) return;
  gtag('event', event, params);
  trackEvent(event, params);
}

// The actions that matter to the shop, picked up from any link on the site:
// calls, WhatsApp, directions, email and social profiles.
function trackLinkClick(e) {
  const link = e.target.closest?.('a[href]');
  if (!link) return;
  const href = link.getAttribute('href');
  const params = { link_url: href, page_path: location.pathname };
  if (href.startsWith('tel:')) track('call_click', params);
  else if (/wa\.me|whatsapp\.com/.test(href)) track('whatsapp_click', params);
  else if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl/.test(href)) track('directions_click', params);
  else if (href.startsWith('mailto:')) track('email_click', params);
  else if (/instagram\.com|facebook\.com|linkedin\.com/.test(href)) track('social_click', params);
}
