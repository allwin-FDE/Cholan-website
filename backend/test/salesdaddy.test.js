// Store-finder visitors as Sales Daddy leads, against a stand-in for the
// Sales Daddy API (nothing leaves the machine).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { pushFinderLead } from '../src/lib/salesdaddy.js';
import { finderLeadNote } from '../src/lib/stores/service.js';

const realFetch = globalThis.fetch;
let calls = [];
let answers = [];
beforeEach(() => {
  calls = [];
  answers = [];
  config.salesDaddy.apiKey = 'sd_test_key';
  config.salesDaddy.baseUrl = 'https://sd.test/v1/ext';
  config.salesDaddy.source = 'website';
  config.salesDaddy.finderTag = 'Store finder';
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
    const next = answers.shift() || { ok: true };
    return { ok: next.status ? next.status < 400 : true, status: next.status || 200, json: async () => next };
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

const person = {
  name: 'Lakshmi R',
  phone: '9876543210',
  from: 'popup',
  how: 'typed',
  query: 'Sulur',
  place: 'Sulur, Tamil Nadu',
  nearest: { code: 'CHO100001', name: 'Sulur', city: 'Sulur', km: 2.4, byRoad: true },
};

test('the note says where they searched and which shop they were shown', () => {
  const note = finderLeadNote(person);
  assert.match(note, /home page popup/);
  assert.match(note, /typed "Sulur" \(Sulur, Tamil Nadu\)/);
  assert.match(note, /Sulur \(CHO100001\), 2\.4 km by road/);
  assert.match(finderLeadNote({ ...person, how: 'location', query: '', from: 'page' }), /Stores page[\s\S]*their phone’s location/);
});

test('a new number: one lead with name, mobile, source, tag, city and note', async () => {
  answers = [{ ok: true, leadId: 'L1', duplicate: false }];
  const r = await pushFinderLead({ name: person.name, phone: person.phone, city: 'Sulur', note: 'n' });
  assert.deepEqual(r, { leadId: 'L1', duplicate: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://sd.test/v1/ext/leads');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].auth, 'Bearer sd_test_key');
  assert.deepEqual(calls[0].body, { name: 'Lakshmi R', mobile: '9876543210', source: 'website', tags: ['Store finder'], city: 'Sulur', note: 'n' });
});

test('a known number: note added and the tag joined to its own tags', async () => {
  answers = [{ ok: true, leadId: 'L2', duplicate: true }, { ok: true }, { ok: true, lead: { id: 'L2', tags: ['Diwali'] } }, { ok: true }];
  const r = await pushFinderLead({ name: person.name, phone: person.phone, note: 'again' });
  assert.deepEqual(r, { leadId: 'L2', duplicate: true });
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.url.replace('https://sd.test/v1/ext', '')}`),
    ['POST /leads', 'POST /leads/L2/notes', 'GET /leads/L2', 'PATCH /leads/L2'],
  );
  assert.deepEqual(calls[1].body, { body: 'again' });
  assert.deepEqual(calls[3].body, { tags: ['Diwali', 'Store finder'] });
});

test('a known number that already has the tag is not changed', async () => {
  answers = [{ ok: true, leadId: 'L3', duplicate: true }, { ok: true }, { ok: true, lead: { id: 'L3', tags: ['Store finder'] } }];
  await pushFinderLead({ name: person.name, phone: person.phone, note: 'x' });
  assert.equal(calls.length, 3);
});

test('no tag set: the lead goes without tags', async () => {
  config.salesDaddy.finderTag = '';
  answers = [{ ok: true, leadId: 'L4', duplicate: false }];
  await pushFinderLead({ name: person.name, phone: person.phone, note: 'x' });
  assert.equal('tags' in calls[0].body, false);
});

test('a Sales Daddy error is thrown with its message (kept for a retry)', async () => {
  answers = [{ ok: false, status: 429, error: 'rate_limited', message: 'Too many requests' }];
  await assert.rejects(pushFinderLead({ name: person.name, phone: person.phone, note: 'x' }), /429: rate_limited Too many requests/);
});
