// Which app each admin route belongs to, and who may open it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appsOf, areaNeeded, opensArea } from '../src/lib/auth.js';

test('business routes are the plant, WhatsApp routes whatsapp, the rest the website, /me any', () => {
  for (const url of ['/api/admin/sales/orders', '/api/admin/sales/deliveries', '/api/admin/business/items?x=1', '/api/admin/inward/bills/3', '/api/admin/accounts/online']) {
    assert.equal(areaNeeded(url), 'plant', url);
  }
  for (const url of ['/api/admin/whatsapp/campaigns', '/api/admin/whatsapp?x=1', '/api/admin/whatsapp/templates/abc']) {
    assert.equal(areaNeeded(url), 'whatsapp', url);
  }
  for (const url of ['/api/admin/visits', '/api/admin/enquiries', '/api/admin/posts', '/api/admin/access', '/api/admin/analyst/journeys', '/api/admin/salesforce', '/api/admin/businesses', '/api/admin/whatsappish']) {
    assert.equal(areaNeeded(url), 'website', url);
  }
  assert.equal(areaNeeded('/api/admin/me'), null);
});

test('each person opens only their apps', () => {
  assert.equal(opensArea(['plant'], 'plant'), true);
  assert.equal(opensArea(['plant'], 'website'), false);
  assert.equal(opensArea(['website'], 'whatsapp'), false);
  assert.equal(opensArea(['website', 'whatsapp'], 'whatsapp'), true);
  assert.equal(opensArea(['plant'], null), true);
  assert.equal(opensArea(undefined, 'website'), false);
});

test('older entries keep what they had', () => {
  assert.deepEqual(appsOf({}), ['website', 'plant']);
  assert.deepEqual(appsOf({ area: 'both' }), ['website', 'plant']);
  assert.deepEqual(appsOf({ area: 'plant' }), ['plant']);
  assert.deepEqual(appsOf({ area: 'website' }), ['website']);
  assert.deepEqual(appsOf({ area: 'plant', apps: ['whatsapp', 'website', 'nonsense'] }), ['website', 'whatsapp']);
});
