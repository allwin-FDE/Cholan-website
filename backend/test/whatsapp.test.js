// The WhatsApp pieces that don't need a database: Meta's template rules,
// phone numbers, CSV imports, filling a template for a contact, the message
// sent, reading Meta's notifications and checking their signature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buildTemplate, renderText, slotsOf, variablesIn } from '../src/lib/whatsapp/templates.js';
import { contactsFromRows, isStart, isStop, missingValues, parseCsv, readNotification, signatureOk, templateMessage, valuesFor, waNumber } from '../src/lib/whatsapp/messages.js';
import { pickAudience } from '../src/lib/whatsapp/service.js';

const offer = {
  name: 'diwali_offer',
  language: 'en',
  category: 'MARKETING',
  header: { type: 'text', text: 'Hello {{1}}', example: 'Lakshmi' },
  body: { text: 'Hi {{1}}, your favourite {{2}} is now ₹{{3}} for this week only. Order today.', examples: ['Lakshmi', 'Ponni 5 kg', '480'] },
  footer: { text: 'Reply STOP to stop offers' },
  buttons: [
    { type: 'url', text: 'Order now', url: 'https://www.cholanrice.in/products/{{1}}', example: 'moongil-ponni' },
    { type: 'phone', text: 'Call us', phone: '+919092266667' },
    { type: 'copy_code', example: 'DIWALI10' },
  ],
};

test('a template form becomes what Meta expects', () => {
  const t = buildTemplate(offer);
  assert.equal(t.name, 'diwali_offer');
  const [header, body, footer, buttons] = t.components;
  assert.deepEqual(header, { type: 'HEADER', format: 'TEXT', text: 'Hello {{1}}', example: { header_text: ['Lakshmi'] } });
  assert.deepEqual(body.example, { body_text: [['Lakshmi', 'Ponni 5 kg', '480']] });
  assert.equal(footer.text, 'Reply STOP to stop offers');
  assert.deepEqual(buttons.buttons[0], { type: 'URL', text: 'Order now', url: 'https://www.cholanrice.in/products/{{1}}', example: ['https://www.cholanrice.in/products/moongil-ponni'] });
  assert.deepEqual(buttons.buttons[1], { type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+919092266667' });
  assert.deepEqual(buttons.buttons[2], { type: 'COPY_CODE', example: 'DIWALI10' });
});

test("Meta's rules are checked before sending", () => {
  const bad = (patch) => {
    try {
      buildTemplate({ ...offer, ...patch });
      return null;
    } catch (e) {
      return e.fields;
    }
  };
  assert.ok(bad({ name: 'Diwali Offer' }).name);
  assert.ok(bad({ body: { text: 'Hi {{1}} and {{3}} welcome to the shop today', examples: ['a', 'b'] } }).body);
  assert.ok(bad({ body: { text: '{{1}} welcome to the shop', examples: ['a'] } }).body);
  assert.ok(bad({ body: { text: 'Hi {{1}} welcome to the shop today', examples: [] } }).bodyExamples);
  assert.ok(bad({ footer: { text: 'Hi {{1}}' } }).footer);
  assert.ok(bad({ header: { type: 'image' } }).headerMedia);
  assert.ok(bad({ buttons: [{ type: 'url', text: 'Go', url: 'http://x.com' }] }).button0);
  assert.ok(bad({ buttons: [{ type: 'quick_reply', text: 'A' }, { type: 'phone', text: 'Call', phone: '+919092266667' }, { type: 'quick_reply', text: 'B' }] }).buttons);
  assert.equal(bad({}), null);
});

test('authentication templates use Meta’s fixed body and a copy-code button', () => {
  const t = buildTemplate({ name: 'login_code', language: 'en', category: 'AUTHENTICATION', auth: { expiresMinutes: 10 } });
  assert.deepEqual(t.components[0], { type: 'BODY', add_security_recommendation: true });
  assert.deepEqual(t.components[1], { type: 'FOOTER', code_expiration_minutes: 10 });
  assert.equal(t.components[2].buttons[0].otp_type, 'COPY_CODE');
  assert.equal(slotsOf(t).body, 1);
});

test('phone numbers become WhatsApp numbers', () => {
  assert.equal(waNumber('98765 43210'), '919876543210');
  assert.equal(waNumber('+91 98765-43210'), '919876543210');
  assert.equal(waNumber('09876543210'), '919876543210');
  assert.equal(waNumber('919876543210'), '919876543210');
  assert.equal(waNumber('+971 50 123 4567'), '971501234567');
  assert.equal(waNumber('12345'), '');
  assert.equal(waNumber('5876543210'), '');
});

test('a CSV file becomes contacts, with the bad rows listed', () => {
  const rows = parseCsv('Name,Mobile,Tags,City\n"Lakshmi, R",98765 43210,vip|hotel,Coimbatore\nRavi,12345,,\r\nMeena,+919445512345,,Erode\n');
  const { contacts, bad } = contactsFromRows(rows, { tags: ['diwali'] });
  assert.equal(contacts.length, 2);
  assert.deepEqual(contacts[0], { wa: '919876543210', name: 'Lakshmi, R', tags: ['diwali', 'vip', 'hotel'], attributes: { city: 'Coimbatore' } });
  assert.deepEqual(bad, [{ row: 3, value: '12345' }]);
});

test("a template is filled with each contact's details and sent as Meta wants", () => {
  const meta = { ...buildTemplate(offer), status: 'APPROVED' };
  const mapping = {
    header: { source: 'field', field: 'first_name', fallback: 'there' },
    body: [{ source: 'field', field: 'first_name', fallback: 'there' }, { source: 'static', value: 'Ponni 5 kg' }, { source: 'field', field: 'price', fallback: '480' }],
    buttons: { 0: { source: 'static', value: 'moongil-ponni' }, 2: { source: 'static', value: 'DIWALI10' } },
  };
  const values = valuesFor(meta, mapping, { wa: '919876543210', name: 'Lakshmi Ramesh', attributes: {} });
  assert.deepEqual(values.body, ['Lakshmi', 'Ponni 5 kg', '480']);
  assert.equal(missingValues(meta, values), null);
  assert.match(renderText(meta, values), /Hi Lakshmi, your favourite Ponni 5 kg is now ₹480/);
  const msg = templateMessage('919876543210', meta, values);
  assert.equal(msg.template.name, 'diwali_offer');
  assert.deepEqual(msg.template.components[0], { type: 'header', parameters: [{ type: 'text', text: 'Lakshmi' }] });
  assert.deepEqual(msg.template.components[2], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'moongil-ponni' }] });
  assert.deepEqual(msg.template.components[3], { type: 'button', sub_type: 'copy_code', index: '2', parameters: [{ type: 'coupon_code', coupon_code: 'DIWALI10' }] });
  assert.equal(missingValues(meta, { ...values, body: ['', 'x', 'y'] }), 'variable {{1}}');
});

test('the audience leaves out people who opted out, and those without consent for marketing', () => {
  const people = [
    { wa: '1', tags: ['vip'], consent: true },
    { wa: '2', tags: ['vip'], consent: false },
    { wa: '3', tags: ['vip'], consent: true, optedOut: true },
    { wa: '4', tags: ['hotel'], consent: true },
  ];
  const m = pickAudience(people, { tags: ['vip'] });
  assert.deepEqual(m.picked.map((p) => p.wa), ['1']);
  assert.deepEqual(m.skipped, { optedOut: 1, noConsent: 1 });
  assert.deepEqual(pickAudience(people, { tags: ['vip'] }, { marketing: false }).picked.map((p) => p.wa), ['1', '2']);
  assert.deepEqual(pickAudience(people, {}).picked.map((p) => p.wa), ['1', '4']);
});

test("Meta's notifications are read, and their signature checked", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [{ wa_id: '919876543210', profile: { name: 'Lakshmi' } }],
              messages: [{ id: 'wamid.IN1', from: '919876543210', timestamp: '1763600000', type: 'text', text: { body: 'STOP' }, context: { id: 'wamid.OUT1' } }],
              statuses: [{ id: 'wamid.OUT2', recipient_id: '919445512345', status: 'failed', timestamp: '1763600001', errors: [{ code: 131026, title: 'Undeliverable' }] }],
            },
          },
          { field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: 123, message_template_name: 'diwali_offer', message_template_language: 'en' } },
        ],
      },
    ],
  };
  const n = readNotification(payload);
  assert.equal(n.incoming[0].name, 'Lakshmi');
  assert.equal(n.incoming[0].replyTo, 'wamid.OUT1');
  assert.equal(isStop(n.incoming[0].text), true);
  assert.equal(isStart('start'), true);
  assert.equal(isStop('please stop by tomorrow'), false);
  assert.equal(n.statuses[0].error.code, 131026);
  assert.deepEqual(n.templates[0], { id: '123', name: 'diwali_offer', language: 'en', status: 'APPROVED', reason: '' });
  const raw = JSON.stringify(payload);
  const sig = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;
  assert.equal(signatureOk(raw, sig, 'app-secret'), true);
  assert.equal(signatureOk(`${raw} `, sig, 'app-secret'), false);
  assert.equal(signatureOk(raw, sig, ''), false);
  assert.deepEqual(variablesIn('a {{2}} b {{ 1 }}'), [2, 1]);
});
