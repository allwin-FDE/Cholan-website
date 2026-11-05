// node --test test/  — the warehouse's money and step rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  amountInWords,
  canMove,
  cleanOrder,
  computeTotals,
  DEFAULT_SETTINGS,
  financialYear,
  forLevel,
  isInterstate,
  lineTax,
  paymentStatus,
  stockEffect,
  stockId,
  toPaise,
} from '../src/lib/warehouse.js';

test('rupees typed by a person become paise', () => {
  assert.equal(toPaise('1,250.50'), 125050);
  assert.equal(toPaise(10), 1000);
  assert.equal(toPaise('0.1'), 10);
  assert.equal(toPaise(''), null);
  assert.equal(toPaise('-5'), null);
  assert.equal(toPaise('abc'), null);
});

test('tax taken out of a price that includes it', () => {
  assert.deepEqual(lineTax(10500, 5, true), { taxablePaise: 10000, taxPaise: 500 });
  assert.deepEqual(lineTax(10000, 0, true), { taxablePaise: 10000, taxPaise: 0 });
});

test('tax added to a price that does not include it', () => {
  assert.deepEqual(lineTax(10000, 5, false), { taxablePaise: 10000, taxPaise: 500 });
  assert.deepEqual(lineTax(10000, 2.5, false), { taxablePaise: 10000, taxPaise: 250 });
});

test('Tamil Nadu buyers pay CGST and SGST, adding up exactly even on an odd paisa', () => {
  const t = computeTotals([{ unitPaise: 10101, qty: 1, gstRate: 5 }], { inclusive: false, interstate: false });
  assert.equal(t.igstPaise, 0);
  assert.equal(t.cgstPaise + t.sgstPaise, 505);
  assert.ok(Math.abs(t.cgstPaise - t.sgstPaise) <= 1);
});

test('other states pay IGST', () => {
  const t = computeTotals([{ unitPaise: 10000, qty: 2, gstRate: 5 }], { inclusive: false, interstate: true });
  assert.equal(t.igstPaise, 1000);
  assert.equal(t.cgstPaise + t.sgstPaise, 0);
  assert.equal(t.totalPaise, 21000);
});

test('the total is rounded to the rupee and the round-off adds up', () => {
  const t = computeTotals([{ unitPaise: 12345, qty: 3, gstRate: 5 }, { unitPaise: 9999, qty: 1, gstRate: 0 }], { inclusive: false });
  assert.equal(t.totalPaise % 100, 0);
  assert.equal(t.taxablePaise + t.cgstPaise + t.sgstPaise + t.igstPaise + t.roundOffPaise, t.totalPaise);
  assert.ok(Math.abs(t.roundOffPaise) <= 50);
});

test('lines add up to the invoice for many small sums', () => {
  for (const unit of [1, 99, 101, 3333, 123456]) {
    for (const rate of [0, 2.5, 5, 12, 18]) {
      for (const inclusive of [true, false]) {
        const t = computeTotals([{ unitPaise: unit, qty: 7, gstRate: rate }, { unitPaise: unit + 1, qty: 3, gstRate: rate }], { inclusive });
        const sum = t.lines.reduce((s, l) => s + l.totalPaise, 0);
        assert.equal(sum + t.roundOffPaise, t.totalPaise);
        if (inclusive) assert.equal(sum, unit * 7 + (unit + 1) * 3);
      }
    }
  }
});

test('amounts in words, the Indian way', () => {
  assert.equal(amountInWords(125000), 'Rupees One Thousand Two Hundred Fifty Only');
  assert.equal(amountInWords(12345678900), 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only');
  assert.equal(amountInWords(5050), 'Rupees Fifty and Fifty Paise Only');
  assert.equal(amountInWords(0), 'Rupees Zero Only');
  assert.equal(amountInWords(10000000), 'Rupees One Lakh Only');
});

test('the financial year turns over on 1 April in India', () => {
  assert.equal(financialYear(new Date('2026-11-02T10:00:00Z')), '26-27');
  assert.equal(financialYear(new Date('2027-03-31T12:00:00Z')), '26-27');
  assert.equal(financialYear(new Date('2027-03-31T19:00:00Z')), '27-28'); // already 1 April in India
});

test('order steps', () => {
  assert.ok(canMove('new', 'confirmed'));
  assert.ok(canMove('packed', 'dispatched'));
  assert.ok(!canMove('new', 'dispatched'));
  assert.ok(!canMove('dispatched', 'cancelled'));
  assert.ok(!canMove('cancelled', 'confirmed'));
  assert.ok(!canMove('nonsense', 'confirmed'));
});

test('what each step does to stock', () => {
  assert.deepEqual(stockEffect('new', 'confirmed'), { type: 'reserve', onHand: 0, reserved: 1, damaged: 0 });
  assert.equal(stockEffect('confirmed', 'packing'), null);
  assert.equal(stockEffect('new', 'cancelled'), null);
  assert.equal(stockEffect('packed', 'cancelled').reserved, -1);
  assert.deepEqual(stockEffect('packed', 'dispatched'), { type: 'dispatch', onHand: -1, reserved: -1, damaged: 0 });
  assert.equal(stockEffect('delivered', 'returned').onHand, 1);
  assert.deepEqual(stockEffect('delivered', 'returned', 'damaged'), { type: 'return-damaged', onHand: 0, reserved: 0, damaged: 1 });
});

test('stock ids', () => assert.equal(stockId('karikalan-rice', '26 kg'), 'karikalan-rice__26-kg'));

test('the buyer is in another state only when the names differ', () => {
  const seller = { state: 'Tamil Nadu' };
  assert.equal(isInterstate({ state: 'tamil nadu ' }, seller), false);
  assert.equal(isInterstate({ state: 'Kerala' }, seller), true);
});

test('payment status', () => {
  assert.equal(paymentStatus({ totalPaise: 0 }), 'not-priced');
  assert.equal(paymentStatus({ totalPaise: 100, paidPaise: 0 }), 'unpaid');
  assert.equal(paymentStatus({ totalPaise: 100, paidPaise: 40 }), 'part');
  assert.equal(paymentStatus({ totalPaise: 100, paidPaise: 100 }), 'paid');
});

const settings = { ...DEFAULT_SETTINGS, prices: { 'karikalan-rice__26-kg': 150000 }, gst: { 'karikalan-rice': 5 } };
const body = { customer: { name: 'Ravi', phone: '98765 43210' }, items: [{ productId: 'karikalan-rice', name: 'Karikalan', pack: '26 kg', qty: 2 }] };

test('an order takes its price from the list', () => {
  const { value } = cleanOrder(body, { settings });
  assert.equal(value.items[0].unitPaise, 150000);
  assert.equal(value.items[0].gstRate, 5);
});

test('staff cannot set a price; a manager can', () => {
  const typed = { ...body, items: [{ ...body.items[0], unitRupees: '1' }] };
  assert.equal(cleanOrder(typed, { settings, manager: false }).value.items[0].unitPaise, 150000);
  assert.equal(cleanOrder(typed, { settings, manager: true }).value.items[0].unitPaise, 100);
});

test('an order needs a customer, a phone and products', () => {
  assert.ok(cleanOrder({}, { settings }).errors.name);
  assert.ok(cleanOrder({}, { settings }).errors.phone);
  assert.ok(cleanOrder({}, { settings }).errors.items);
  assert.ok(cleanOrder({ ...body, items: [{ ...body.items[0], qty: 0 }] }, { settings }).errors.items);
  assert.ok(cleanOrder({ ...body, items: [body.items[0], body.items[0]] }, { settings }).errors.items);
});

test('staff never receive money', () => {
  const order = {
    number: 'CO-1',
    status: 'new',
    totalPaise: 100,
    paidPaise: 50,
    taxablePaise: 95,
    invoiceId: 'x',
    invoiceNumber: 'y',
    items: [{ name: 'A', qty: 1, unitPaise: 100, gstRate: 5, hsn: '1006' }],
    history: [{ action: 'Order created' }, { action: 'Payment received', detail: '₹1', money: true }],
  };
  const seen = JSON.stringify(forLevel(order, 'staff'));
  for (const word of ['Paise', 'gstRate', 'invoice', 'Payment received', 'paymentStatus', 'hsn']) assert.ok(!seen.includes(word), word);
  assert.ok(JSON.stringify(forLevel(order, 'manager')).includes('totalPaise'));
});
