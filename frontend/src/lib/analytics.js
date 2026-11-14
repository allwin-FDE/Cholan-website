import { GA_ID } from '../config/analytics.js';
import { countAnonymousVisit, markVisitCounted, notePage, startTracking, stopTracking, trackEvent } from './tracker.js';

// Google Analytics 4 and the site's own visit counting (lib/tracker.js), for
// every visitor unless they turn it off. The cookie notice
// (components/common/Analytics.jsx) says so, and its "Don't track me", also
// under Cookie settings in the footer, stops both and clears their cookies.
// The choice is kept in localStorage. A visitor who pressed Reject on the old
// banner stays off. With it off, only the bare fact of a visit is counted, with
// no ID or details (tracker.js countAnonymousVisit). Ads features stay off:
// this is for measuring the site only.

const CONSENT_KEY = 'cholan-consent'; // 'granted' (seen the notice) | 'denied' (turned off) | none yet

// Off without an ID, and off for automated browsers, so the build's page
// snapshots (scripts/prerender.mjs) carry no banner and send no visits. Off
// inside a frame too: the dashboard's heatmap preview shows site pages, and
// those views are the shop's own, not visits.
export const analyticsEnabled =
  Boolean(GA_ID) && typeof navigator !== 'undefined' && !navigator.webdriver && window.top === window.self;

let loaded = false;
let measuring = false; // counting now (not turned off since loading)

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
    // Already counting (OK on the notice): nothing to restart, and the page
    // in view has been counted. Turned back on: start again, from this page.
    if (loaded && measuring) return window.dispatchEvent(new Event('cholan:consent'));
    if (loaded) {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      startTracking();
    }
    load();
    measuring = true;
    trackPageView();
  } else {
    // This visit was already counted, with its pages, before turning it off.
    if (measuring) markVisitCounted();
    measuring = false;
    stopTracking();
    if (loaded) {
      gtag('consent', 'update', { analytics_storage: 'denied' });
      clearCookies();
    }
  }
  window.dispatchEvent(new Event('cholan:consent'));
}

// Called once at start-up: everyone is measured unless they turned it off.
export function initAnalytics() {
  if (!analyticsEnabled) return;
  if (getConsent() === 'denied') {
    countAnonymousVisit();
    return;
  }
  load();
  measuring = loaded;
}

const active = () => loaded && getConsent() !== 'denied';

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
