// The WhatsApp business profile form → what Meta takes, and the test-mode
// stand-in for Meta's profile calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileUpdate, profileView } from '../src/lib/whatsapp/profile.js';
import { graph } from '../src/lib/whatsapp/graph.js';

const good = {
  about: '  Pure goodness, always. ',
  description: 'Ponni, idli and seeraga samba rice.\r\nShops across Tamil Nadu.',
  address: '32/B2, SP Kannusamy Street, Coimbatore 641027',
  email: 'care@cholanrice.in',
  websites: ['www.cholanrice.in', ''],
  vertical: 'GROCERY',
};

test('a good form is tidied: trimmed, one kind of line break, https added, empty website dropped', () => {
  const out = profileUpdate(good);
  assert.equal(out.about, 'Pure goodness, always.');
  assert.equal(out.description, 'Ponni, idli and seeraga samba rice.\nShops across Tamil Nadu.');
  assert.deepEqual(out.websites, ['https://www.cholanrice.in']);
  assert.equal(out.vertical, 'GROCERY');
});

test('empty fields are sent empty (so they clear); no category is left out', () => {
  const out = profileUpdate({ about: 'Hi', description: '', address: '', email: '', websites: [], vertical: '' });
  assert.equal(out.description, '');
  assert.deepEqual(out.websites, []);
  assert.equal('vertical' in out, false);
});

test('Meta limits are checked with a message per field', () => {
  const bad = (form) => {
    try {
      profileUpdate(form);
    } catch (e) {
      return e.fields;
    }
    return null;
  };
  assert.match(bad({ ...good, about: '' }).about, /Required/);
  assert.match(bad({ ...good, about: 'x'.repeat(140) }).about, /139/);
  assert.match(bad({ ...good, about: 'two\nlines' }).about, /One line/);
  assert.match(bad({ ...good, description: 'x'.repeat(513) }).description, /512/);
  assert.match(bad({ ...good, email: 'abc@x' }).email, /look right/);
  assert.match(bad({ ...good, websites: ['a', 'b', 'c'] }).websites, /two/);
  assert.match(bad({ ...good, websites: ['not a site'] }).websites, /full address/);
  assert.match(bad({ ...good, vertical: 'SPACESHIPS' }).vertical, /category/);
});

test('the view always has two website boxes and the picture link', () => {
  const v = profileView({ about: 'A', websites: ['https://a.in'], profile_picture_url: 'https://pps/x.jpg' });
  assert.deepEqual(v.websites, ['https://a.in', '']);
  assert.equal(v.pictureUrl, 'https://pps/x.jpg');
  assert.equal(v.email, '');
});

test('test mode: the profile can be read, changed and given a picture', async () => {
  const g = graph({ fake: true });
  await g.updateProfile({ messaging_product: 'whatsapp', ...profileUpdate(good) });
  const p = await g.profile();
  assert.equal(p.about, 'Pure goodness, always.');
  assert.equal('messaging_product' in p, false);
  await g.updateProfile({ profile_picture_handle: await g.uploadSample(Buffer.from('x'), 'image/png') });
  assert.ok((await g.profile()).profile_picture_url);
});
