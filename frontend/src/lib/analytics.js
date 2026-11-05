import { GA_ID } from '../config/analytics.js';
import { notePage, startTracking, stopTracking, trackEvent } from './tracker.js';

// Google Analytics 4, behind the visitor's consent. Nothing from Google loads
// and no cookie is set until the visitor accepts in the cookie banner
// (components/common/Analytics.jsx); the choice is kept in localStorage.
// Ads features stay off: this is for measuring the site only. The same choice
// starts and stops the site's own tracking for the dashboard (lib/tracker.js).

const CONSENT_KEY = 'cholan-consent'; // 'granted' | 'denied'

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

export function getConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
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

// Clears Google Analytics' own cookies (_ga, _ga_<id>) after a withdrawal.
function clearCookies() {
  const host = location.hostname.replace(/^www\./, '');
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim();
    if (!name.startsWith('_ga')) continue;
    for (const domain of ['', `; domain=${host}`, `; domain=.${host}`]) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
    }
  }
}

export function setConsent(choice) {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Private mode: the choice holds for this visit only.
  }
  if (choice === 'granted') {
    if (loaded) gtag('consent', 'update', { analytics_storage: 'granted' });
    load();
    trackPageView();
  } else {
    stopTracking();
    if (loaded) {
      gtag('consent', 'update', { analytics_storage: 'denied' });
      clearCookies();
    }
  }
  window.dispatchEvent(new Event('cholan:consent'));
}

// Called once at start-up: a visitor who accepted before is measured again.
export function initAnalytics() {
  if (analyticsEnabled && getConsent() === 'granted') load();
}

const active = () => loaded && getConsent() === 'granted';

// The dashboard and posting page are the shop's own tools, not part of the site's visits.
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
