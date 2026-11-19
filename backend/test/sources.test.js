import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributionOf, classify } from '../src/lib/sources.js';
import { sourceTable } from '../src/lib/sourceReport.js';

const ch = (input) => classify(input).channel;

test('ad click ids win over everything else', () => {
  assert.equal(ch({ clickId: 'gclid' }), 'Google Ads');
  assert.equal(ch({ clickId: 'gbraid', referrer: 'https://www.google.com/' }), 'Google Ads');
  assert.equal(ch({ clickId: 'msclkid' }), 'Microsoft Ads');
  assert.equal(ch({ clickId: 'li_fat_id', referrer: 'https://www.linkedin.com/' }), 'LinkedIn Ads');
  // fbclid is on every Facebook link, paid or not.
  assert.equal(ch({ clickId: 'fbclid' }), 'Facebook / Instagram');
  assert.equal(ch({ clickId: 'fbclid', utmSource: 'facebook', utmMedium: 'paid' }), 'Meta Ads');
  assert.equal(ch({ clickId: 'made-up' }), 'Direct');
});

test('utm tags', () => {
  assert.equal(ch({ utmSource: 'google', utmMedium: 'cpc' }), 'Google Ads');
  assert.equal(ch({ utmSource: 'google', utmMedium: 'organic' }), 'Google search');
  assert.equal(ch({ utmSource: 'fb', utmMedium: 'paid' }), 'Meta Ads');
  assert.equal(ch({ utmSource: 'ig', utmMedium: 'paid_social' }), 'Meta Ads');
  assert.equal(ch({ utmSource: 'instagram', utmMedium: 'social' }), 'Facebook / Instagram');
  assert.equal(ch({ utmSource: 'linkedin', utmMedium: 'social', utmCampaign: 'hotel-b2b' }), 'LinkedIn');
  assert.equal(ch({ utmSource: 'linkedin', utmMedium: 'cpc' }), 'LinkedIn Ads');
  assert.equal(ch({ utmSource: 'whatsapp', utmMedium: 'broadcast' }), 'WhatsApp');
  assert.equal(ch({ utmSource: 'gbp', utmMedium: 'organic' }), 'Google Business Profile');
  assert.equal(ch({ utmSource: 'bag', utmMedium: 'qr' }), 'QR codes and print');
  assert.equal(ch({ utmSource: 'newsletter', utmMedium: 'email' }), 'Email');
  assert.equal(ch({ utmSource: 'justdial' }), 'Directories');
  assert.equal(ch({ utmSource: 'someone' }), 'Other campaigns');
  const c = classify({ utmSource: 'facebook', utmMedium: 'cpc', utmCampaign: 'Pongal offer' });
  assert.deepEqual([c.source, c.medium, c.campaign], ['facebook', 'cpc', 'Pongal offer']);
});

test('referrers', () => {
  assert.equal(ch({ referrer: 'https://www.google.co.in/' }), 'Google search');
  assert.equal(ch({ referrer: 'https://gemini.google.com/app' }), 'AI assistants');
  assert.equal(ch({ referrer: 'https://chatgpt.com/' }), 'AI assistants');
  assert.equal(ch({ referrer: 'https://l.instagram.com/' }), 'Facebook / Instagram');
  assert.equal(ch({ referrer: 'https://lm.facebook.com/' }), 'Facebook / Instagram');
  assert.equal(ch({ referrer: 'https://www.linkedin.com/feed/' }), 'LinkedIn');
  assert.equal(ch({ referrer: 'android-app://com.linkedin.android/' }), 'LinkedIn');
  assert.equal(ch({ referrer: 'android-app://com.google.android.gm/' }), 'Email');
  assert.equal(ch({ referrer: 'https://www.bing.com/' }), 'Other search engines');
  assert.equal(ch({ referrer: 'https://m.youtube.com/' }), 'YouTube');
  assert.equal(ch({ referrer: 'https://www.justdial.com/x' }), 'Directories');
  assert.equal(ch({ referrer: 'https://bagofrice.example.com/' }), 'Other websites');
  assert.equal(ch({ referrer: 'https://www.cholanrice.in/products' }), 'Direct');
  assert.equal(ch({ referrer: '' }), 'Direct');
  assert.equal(ch({}), 'Direct');
});

test('an order from a direct visit counts for the last source in 30 days', () => {
  const now = Date.parse('2026-11-19T10:00:00Z');
  const day = 86_400_000;
  const last = { utmSource: 'facebook', utmMedium: 'paid', utmCampaign: 'Seeraga', at: now - 3 * day };
  const first = { referrer: 'https://www.google.com/', at: now - 40 * day };
  const a = attributionOf({ sid: 'session-1', vid: 'visitor-1', visit: { referrer: '' }, last, first }, now);
  assert.equal(a.channel, 'Meta Ads');
  assert.equal(a.campaign, 'Seeraga');
  assert.equal(a.from, 'an earlier visit');
  assert.equal(a.firstChannel, 'Google search');
  assert.equal(a.sessionId, 'session-1');

  const old = attributionOf({ visit: {}, last: { ...last, at: now - 31 * day } }, now);
  assert.equal(old.channel, 'Direct');
  assert.equal(old.firstChannel, 'Direct');

  // This visit's own source wins over an earlier one.
  const own = attributionOf({ visit: { clickId: 'gclid' }, last }, now);
  assert.equal(own.channel, 'Google Ads');
  assert.equal(own.from, 'this visit');

  // Rubbish in: still an answer, with nothing unsafe kept.
  const junk = attributionOf({ sid: '<script>', visit: 'x', last: { at: 'soon' } });
  assert.equal(junk.channel, 'Direct');
  assert.equal(junk.sessionId, '');
  assert.equal(attributionOf(undefined).channel, 'Direct');
});

test('the report adds visits, enquiries and orders by channel and campaign', () => {
  const t = sourceTable({
    visits: [
      { vid: 'a', utmSource: 'facebook', utmMedium: 'paid', utmCampaign: 'Pongal', actionNames: ['whatsapp_click'] },
      { vid: 'a', utmSource: 'facebook', utmMedium: 'paid', utmCampaign: 'Pongal' },
      { vid: 'b', referrer: 'https://www.google.com/' },
      { vid: 'c' },
    ],
    enquiries: [
      { channel: 'Meta Ads', channelSource: 'facebook', channelCampaign: 'Pongal' },
      // Sent before channels were kept: sorted from its tags.
      { utmSource: 'linkedin', utmMedium: 'social' },
    ],
    orders: [
      { channel: 'Meta Ads', source: 'facebook', medium: 'paid', campaign: 'Pongal', subtotal_paise: 65600, first_channel: 'Google search' },
      { channel: 'Direct', subtotal_paise: 10000 },
      { subtotal_paise: 5000 },
    ],
  });
  const meta = t.channels.find((r) => r.channel === 'Meta Ads');
  assert.deepEqual([meta.visits, meta.visitors, meta.contacted, meta.enquiries, meta.orders, meta.revenuePaise], [2, 1, 1, 1, 1, 65600]);
  assert.equal(meta.orderRate, 50);
  assert.equal(t.channels[0].channel, 'Meta Ads');
  assert.equal(t.channels.find((r) => r.channel === 'LinkedIn').enquiries, 1);
  assert.equal(t.channels.find((r) => r.channel === 'Not recorded').orders, 1);
  assert.deepEqual(t.totals, { visits: 4, contacted: 1, enquiries: 2, orders: 3, revenuePaise: 80600, visitors: 3 });
  const pongal = t.campaigns.find((c) => c.campaign === 'Pongal');
  assert.deepEqual([pongal.visits, pongal.enquiries, pongal.orders], [2, 1, 1]);
  // One Meta campaign, shown on Facebook and Instagram: one row.
  const both = sourceTable({ visits: [{ utmSource: 'fb', utmMedium: 'paid', utmCampaign: 'Pongal' }, { utmSource: 'ig', utmMedium: 'paid', utmCampaign: 'pongal' }] });
  assert.equal(both.campaigns.length, 1);
  assert.equal(both.campaigns[0].visits, 2);
  assert.equal(both.campaigns[0].source, 'fb, ig');
  assert.ok(!t.campaigns.some((c) => c.channel === 'Direct'));
  assert.equal(t.firstFound.find((f) => f.channel === 'Google search').orders, 1);
});
