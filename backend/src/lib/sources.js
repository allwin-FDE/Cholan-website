// Where people come from: one set of rules for visits, enquiries and website
// orders, so the Sources report adds up across all three.
//
// A visit is sorted by, in order: the ad's click id (Google, Microsoft,
// LinkedIn and TikTok ads add one to the link), the link's utm_ tags, and
// the site the visitor came from (the referrer). Nothing of these: Direct.

const PAID_MEDIUM = /(^|[_\- ])(cpc|ppc|cpm|cpv|paid|ads?|display|sponsored|retargeting|remarketing|boost(ed)?)($|[_\- ])|paid/i;

// Click ids the tracker notes (frontend/src/lib/tracker.js): the kind only, never the value.
export const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'li_fat_id', 'ttclid', 'fbclid'];

// Sites by the address a visitor came from: [pattern, source name, medium].
const SITES = [
  // Phone apps, which name themselves (android-app://com.linkedin.android).
  [/^com\.google\.android\.gm$/, 'Email', 'email'],
  [/^com\.google\.android\.googlequicksearchbox$/, 'Google', 'search'],
  [/^com\.linkedin\./, 'LinkedIn', 'social'],
  [/^com\.whatsapp/, 'WhatsApp', 'social'],
  [/^com\.instagram\./, 'Instagram', 'social'],
  [/^com\.facebook\./, 'Facebook', 'social'],
  [/^com\.google\.android\.youtube$/, 'YouTube', 'social'],
  // Before Google's own pattern, which would take it.
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/, 'Gemini', 'ai'],
  [/(^|\.)maps\.google\.|(^|\.)google\.[a-z.]+\/maps/, 'Google Maps', 'maps'],
  [/(^|\.)google\.[a-z.]+$|(^|\.)googleadservices\.com$|(^|\.)doubleclick\.net$/, 'Google', 'search'],
  [/(^|\.)bing\.com$/, 'Bing', 'search'],
  [/duckduckgo\.com$/, 'DuckDuckGo', 'search'],
  [/(^|\.)yahoo\.com$/, 'Yahoo', 'search'],
  [/(^|\.)yandex\./, 'Yandex', 'search'],
  [/(^|\.)instagram\.com$/, 'Instagram', 'social'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.(me|com)$|(^|\.)messenger\.com$/, 'Facebook', 'social'],
  [/(^|\.)whatsapp\.(com|net)$|^wa\.me$/, 'WhatsApp', 'social'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube', 'social'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn', 'social'],
  [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, 'X (Twitter)', 'social'],
  [/(^|\.)pinterest\./, 'Pinterest', 'social'],
  [/(^|\.)reddit\.com$/, 'Reddit', 'social'],
  [/(^|\.)quora\.com$/, 'Quora', 'social'],
  [/(^|\.)t\.me$|(^|\.)telegram\.(org|me)$/, 'Telegram', 'social'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT', 'ai'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity', 'ai'],
  [/(^|\.)claude\.ai$/, 'Claude', 'ai'],
  [/(^|\.)copilot\.microsoft\.com$/, 'Copilot', 'ai'],
  [/(^|\.)justdial\.com$/, 'JustDial', 'directory'],
  [/(^|\.)indiamart\.com$/, 'IndiaMART', 'directory'],
  [/(^|\.)tradeindia\.com$/, 'TradeIndia', 'directory'],
  [/(^|\.)sulekha\.com$/, 'Sulekha', 'directory'],
  [/mail\.google\.com$|outlook\.(live|office)\.com$|mail\.yahoo\.com$/, 'Email', 'email'],
];
const OWN_SITE = /(^|\.)cholanrice\.in$|\.web\.app$|\.firebaseapp\.com$|^localhost$|^127\.0\.0\.1$/;

const text = (value, max = 120) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '');

function hostOf(referrer) {
  try {
    return new URL(referrer).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

// The channel a source falls in, as the report groups it.
function channelOf(src, med, clickId) {
  const s = src.toLowerCase();
  const paid = PAID_MEDIUM.test(med) || ['gclid', 'gbraid', 'wbraid', 'msclkid', 'li_fat_id', 'ttclid'].includes(clickId);
  if (['gclid', 'gbraid', 'wbraid'].includes(clickId)) return 'Google Ads';
  if (clickId === 'msclkid') return 'Microsoft Ads';
  if (clickId === 'li_fat_id') return 'LinkedIn Ads';
  if (clickId === 'ttclid') return 'TikTok Ads';
  // Any other website: its name could look like anything below.
  if (med === 'referral') return paid ? 'Other ads' : 'Other websites';
  if (/google ?maps|^gbp$|google[_\- ]?business|^gmb$|business ?profile/.test(s)) return 'Google Business Profile';
  if (/gemini|chatgpt|openai|perplexity|claude|copilot/.test(s) || med === 'ai') return 'AI assistants';
  if (/^(fb|ig|an|msg)$|facebook|instagram|meta|messenger|audience_network/.test(s)) return paid ? 'Meta Ads' : 'Facebook / Instagram';
  if (/google|adwords|youtube_ads/.test(s) && paid) return 'Google Ads';
  if (/google/.test(s)) return 'Google search';
  if (/linkedin|lnkd/.test(s)) return paid ? 'LinkedIn Ads' : 'LinkedIn';
  if (/youtube/.test(s)) return paid ? 'YouTube Ads' : 'YouTube';
  if (/whatsapp|^wa$/.test(s) || /whatsapp/.test(med)) return 'WhatsApp';
  if (/bing|microsoft/.test(s)) return paid ? 'Microsoft Ads' : 'Other search engines';
  if (/twitter|^x$|^x \(twitter\)$/.test(s)) return paid ? 'X Ads' : 'X (Twitter)';
  if (/duckduckgo|yahoo|yandex|ecosia|baidu/.test(s)) return 'Other search engines';
  if (/^email$|newsletter|mailchimp|brevo|sendinblue/.test(s) || /^e-?mail$|newsletter/.test(med)) return 'Email';
  if (/sms/.test(s) || /^sms$/.test(med)) return 'SMS';
  if (/^qr|qr$|poster|flyer|print|pamphlet|packet|bag|offline|visiting ?card/.test(s) || /^(qr|qr ?code|print|offline)$/.test(med)) return 'QR codes and print';
  if (/justdial|indiamart|tradeindia|sulekha/.test(s) || med === 'directory') return 'Directories';
  if (/pinterest|reddit|quora|telegram|tiktok|sharechat|moj/.test(s) || med === 'social') return paid ? 'Other ads' : 'Other social';
  if (paid) return 'Other ads';
  return 'Other campaigns';
}

// { utmSource, utmMedium, utmCampaign, referrer, clickId } → where it came from.
export function classify(input = {}) {
  const utmSource = text(input.utmSource, 100);
  const utmMedium = text(input.utmMedium, 100).toLowerCase();
  const campaign = text(input.utmCampaign, 100);
  const clickId = CLICK_IDS.includes(input.clickId) ? input.clickId : '';
  if (utmSource) {
    return { channel: channelOf(utmSource, utmMedium, clickId), source: utmSource, medium: utmMedium || 'campaign', campaign, clickId };
  }
  const host = hostOf(input.referrer);
  if (!host || OWN_SITE.test(host)) {
    if (clickId && clickId !== 'fbclid') return { channel: channelOf('', '', clickId), source: channelOf('', '', clickId).replace(/ Ads$/, ''), medium: 'cpc', campaign, clickId };
    // Facebook and Instagram add fbclid to every link people tap there, ads or not.
    if (clickId === 'fbclid') return { channel: 'Facebook / Instagram', source: 'Facebook', medium: 'social', campaign, clickId };
    return { channel: 'Direct', source: 'Direct', medium: 'none', campaign, clickId };
  }
  const path = (() => {
    try {
      return host + new URL(input.referrer).pathname;
    } catch {
      return host;
    }
  })();
  for (const [pattern, name, medium] of SITES) {
    if (pattern.test(host) || pattern.test(path)) {
      const med = clickId && clickId !== 'fbclid' ? 'cpc' : medium;
      return { channel: channelOf(name, med, clickId), source: name, medium: med, campaign, clickId };
    }
  }
  return { channel: channelOf(host, 'referral', clickId), source: host, medium: 'referral', campaign, clickId };
}

// The source and medium a visit is stored with (routes/track.js).
export const sourceOf = (meta = {}) => {
  const c = classify(meta);
  return { source: c.source, medium: c.medium, channel: c.channel };
};

// An earlier visit's source counts for this long, when today's visit came
// straight to the site (typed the address, a bookmark, the WhatsApp app).
export const LOOKBACK_DAYS = 30;
const DAY = 86_400_000;

function touch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const t = {
    landing: text(raw.landing, 200),
    referrer: text(raw.referrer, 300),
    utmSource: text(raw.utmSource, 100),
    utmMedium: text(raw.utmMedium, 100),
    utmCampaign: text(raw.utmCampaign, 100),
    clickId: CLICK_IDS.includes(raw.clickId) ? raw.clickId : '',
  };
  const at = Number(raw.at);
  t.at = Number.isFinite(at) && at > 0 && at <= Date.now() + DAY ? at : null;
  return t;
}

// What the site sends with an order or an enquiry: this visit's source, the
// last visit that came from somewhere, the very first one, and the visit's
// ids. Gives the source the order counts for (this visit's, or the last
// one with a source in the past 30 days) and the first source ever seen.
export function attributionOf(raw, now = Date.now()) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const visit = touch(input.visit) || {};
  const last = touch(input.last);
  const first = touch(input.first);
  let chosen = { ...visit, ...classify(visit), from: 'this visit' };
  if (chosen.channel === 'Direct' && last && last.at && now - last.at <= LOOKBACK_DAYS * DAY) {
    const c = classify(last);
    if (c.channel !== 'Direct') chosen = { ...last, ...c, from: 'an earlier visit' };
  }
  const firstTouch = first ? { ...first, ...classify(first) } : { ...chosen };
  return {
    channel: chosen.channel,
    source: chosen.source,
    medium: chosen.medium,
    campaign: chosen.campaign || '',
    clickId: chosen.clickId || '',
    landing: chosen.landing || '',
    referrer: chosen.referrer || '',
    touchAt: chosen.at || null,
    from: chosen.from,
    firstChannel: firstTouch.channel,
    firstSource: firstTouch.source,
    firstCampaign: firstTouch.campaign || '',
    firstAt: firstTouch.at || null,
    sessionId: /^[\w-]{6,64}$/.test(input.sid || '') ? input.sid : '',
    visitorId: /^[\w-]{6,64}$/.test(input.vid || '') ? input.vid : '',
  };
}

// Keeps a website order's source (sales.order_attribution). It never stops
// the order: anything wrong here is logged and the order goes ahead.
export async function saveOrderSource(client, orderId, raw) {
  const a = attributionOf(raw);
  const toTime = (ms) => (ms ? new Date(ms).toISOString() : null);
  await client.query('SAVEPOINT order_source');
  try {
    await client.query(
      `INSERT INTO sales.order_attribution
         (order_id, channel, source, medium, campaign, click_id, landing, referrer, touch_at, touch_from,
          first_channel, first_source, first_campaign, first_at, session_id, visitor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (order_id) DO NOTHING`,
      [
        orderId,
        a.channel,
        a.source || null,
        a.medium || null,
        a.campaign || null,
        a.clickId || null,
        a.landing || null,
        a.referrer || null,
        toTime(a.touchAt),
        a.from,
        a.firstChannel,
        a.firstSource || null,
        a.firstCampaign || null,
        toTime(a.firstAt),
        a.sessionId || null,
        a.visitorId || null,
      ],
    );
    await client.query('RELEASE SAVEPOINT order_source');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT order_source');
    console.error(`[sources] order ${orderId}: source not saved:`, error.message);
  }
  return a;
}
