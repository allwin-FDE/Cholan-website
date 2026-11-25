// The WhatsApp bot's store finder: the pieces with no database (who can
// search, what the answer is read as, the reply), the "Send location" message,
// and shared locations read from Meta's notification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeAsk, mobileOf, placeFrom, storesReply, usableName, ASK_MINUTES } from '../src/lib/whatsapp/storefinder.js';
import { locationRequestMessage, readNotification } from '../src/lib/whatsapp/messages.js';
import { BOT_ACTIONS, DEFAULT_BOT } from '../src/lib/whatsapp/service.js';
import { finderLeadNote } from '../src/lib/stores/service.js';

test('the WhatsApp number becomes the 10-digit mobile; other countries are left out', () => {
  assert.equal(mobileOf('919876543210'), '9876543210');
  assert.equal(mobileOf('+91 98765 43210'), '9876543210');
  assert.equal(mobileOf('14155550100'), '');
  assert.equal(mobileOf('911234567890'), '');
});

test('the WhatsApp name is used only when it is a real name', () => {
  assert.equal(usableName('Lakshmi R'), 'Lakshmi R');
  assert.equal(usableName('  முருகன்  '), 'முருகன்');
  assert.equal(usableName('😀😀'), '');
  assert.equal(usableName('~'), '');
  assert.equal(usableName(''), '');
  assert.equal(usableName('Ravi123'), '');
});

test('the bot waits for an answer for a while, then forgets the search', () => {
  const at = new Date('2026-11-25T10:00:00Z').toISOString();
  assert.ok(activeAsk({ storeAsk: { stage: 'where', at } }, Date.parse(at) + 5 * 60_000));
  assert.equal(activeAsk({ storeAsk: { stage: 'where', at } }, Date.parse(at) + (ASK_MINUTES + 1) * 60_000), null);
  assert.equal(activeAsk({}), null);
});

test('a shared location or a typed place is a place; a menu number is not', () => {
  assert.deepEqual(placeFrom({ text: '📍 Sulur', location: { lat: 11.02, lng: 77.13 } }), { lat: 11.02, lng: 77.13 });
  assert.deepEqual(placeFrom({ text: '641402' }), { q: '641402' });
  assert.deepEqual(placeFrom({ text: ' Sulur ' }), { q: 'Sulur' });
  assert.equal(placeFrom({ text: '3' }), null);
  assert.equal(placeFrom({ text: '' }), null);
});

const result = {
  origin: { kind: 'place', label: 'Sulur, Tamil Nadu' },
  method: 'road',
  results: [
    { name: 'Sulur', address: '3, Kannampalayam Road, Sulur, Tamil Nadu 641402', phone: '9876500001', roadKm: 1.24, straightKm: 0.9, directionsUrl: 'https://maps.example/1' },
    { name: 'Sulur Kalangal', address: '122, Kalangal Road, Sulur', roadKm: 0.6, directionsUrl: 'https://maps.example/2' },
    { name: 'Kalangal', address: 'Kalangal', straightKm: 4.1, directionsUrl: 'https://maps.example/3' },
    { name: 'Fourth', address: 'not shown', roadKm: 9 },
  ],
};

test('the reply lists the nearest three with distance, address, phone and directions', () => {
  const text = storesReply(result);
  assert.match(text, /Nearest Cholan shops to Sulur, Tamil Nadu/);
  assert.match(text, /1\. \*Sulur\* · 1\.2 km by road/);
  assert.match(text, /📞 \+91 9876500001/);
  assert.match(text, /2\. \*Sulur Kalangal\* · 600 m by road/);
  assert.match(text, /3\. \*Kalangal\* · 4\.1 km \(straight line\)/);
  assert.match(text, /Directions: https:\/\/maps\.example\/3/);
  assert.doesNotMatch(text, /Fourth/);
  assert.match(text, /cholanrice\.in\/stores/);
});

test('a number that already searched is told so, with the date', () => {
  const text = storesReply(result, { repeat: true, firstAt: '2026-11-24T06:00:00Z' });
  assert.match(text, /already used the store finder \(on 24 Nov 2026\)/);
  assert.match(storesReply({ ...result, origin: { kind: 'gps' } }), /shops to your location/);
  assert.match(storesReply({ results: [] }), /couldn’t find a Cholan shop/);
});

test('the "Send location" button message is what Meta expects', () => {
  assert.deepEqual(locationRequestMessage('919876543210', 'Share it'), {
    to: '919876543210',
    type: 'interactive',
    interactive: { type: 'location_request_message', body: { text: 'Share it' }, action: { name: 'send_location' } },
  });
});

test('a shared location is read from Meta’s notification', () => {
  const { incoming } = readNotification({
    entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: '919876543210', profile: { name: 'Lakshmi' } }], messages: [{ id: 'w1', from: '919876543210', timestamp: '1764000000', type: 'location', location: { latitude: 11.02, longitude: 77.13, name: 'Home' } }] } }] }],
  });
  assert.deepEqual(incoming[0].location, { lat: 11.02, lng: 77.13, name: 'Home', address: '' });
  assert.match(incoming[0].text, /📍 Home/);
});

test('the bot has the store finder option and the lead note says WhatsApp', () => {
  assert.ok(BOT_ACTIONS.stores);
  assert.ok(DEFAULT_BOT.options.some((o) => o.action === 'stores' && o.title.length <= 24));
  assert.match(finderLeadNote({ from: 'whatsapp', how: 'location', nearest: { name: 'Sulur', code: 'CHO1', km: 1.2, byRoad: true } }), /WhatsApp bot/);
});
