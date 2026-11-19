// Which app (area) each admin route belongs to, and who may open it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaNeeded, opensArea } from '../src/lib/auth.js';

test('business routes are the plant, the rest the website, /me either', () => {
  for (const url of ['/api/admin/sales/orders', '/api/admin/sales/deliveries', '/api/admin/business/items?x=1', '/api/admin/inward/bills/3', '/api/admin/accounts/online']) {
    assert.equal(areaNeeded(url), 'plant', url);
  }
  for (const url of ['/api/admin/visits', '/api/admin/enquiries', '/api/admin/posts', '/api/admin/access', '/api/admin/analyst/journeys', '/api/admin/salesforce', '/api/admin/businesses']) {
    assert.equal(areaNeeded(url), 'website', url);
  }
  assert.equal(areaNeeded('/api/admin/me'), null);
});

test('plant staff stay out of the website admin, and the other way round', () => {
  assert.equal(opensArea('plant', 'plant'), true);
  assert.equal(opensArea('plant', 'website'), false);
  assert.equal(opensArea('website', 'plant'), false);
  assert.equal(opensArea('website', 'website'), true);
  assert.equal(opensArea('both', 'plant'), true);
  assert.equal(opensArea('both', 'website'), true);
  assert.equal(opensArea('plant', null), true);
});
