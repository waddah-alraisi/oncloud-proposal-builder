import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClient, applyProduct, applyQuote, fxFromRates, major } from '../src/builder/links.js';

test('minor units become the builder\'s major-unit strings, without rounding a baisa away', () => {
  assert.equal(major(20000, 3), '20');
  assert.equal(major(12345, 3), '12.345');
  assert.equal(major(1999, 2), '19.99');
  assert.equal(major(null, 2), '0');
  assert.equal(major('x', 2), '');
});

test('a contact is the client, and stays linked', () => {
  const d = applyClient({ attention: '' }, { public_id: 'C1', display_name: ' Sur Hotels ', attention: 'Ali, CFO' });
  assert.deepEqual([d.client, d.clientId, d.attention], ['Sur Hotels', 'C1', 'Ali, CFO']);
  assert.equal(applyClient({ attention: 'Kept' }, { public_id: 'C2', display_name: 'X', attention: 'Y' }).attention, 'Kept');
});

test('a product is a subscription line or an implementation line at its price', () => {
  const d = { subs: [], oneoff: [], currency: '' };
  applyProduct(d, 'subs', { public_id: 'P1', name: 'Growth plan', amount: 1200, currency: 'OMR' });
  applyProduct(d, 'oneoff', { public_id: 'P2', name: 'Setup', amount: null, currency: 'OMR' });
  assert.deepEqual(d.subs[0], { line: 'Growth plan', basis: 'Per year', qty: '1', unit: '1200', disc: '', when: 'In advance', product: 'P1' });
  assert.deepEqual(d.oneoff[0], { line: 'Setup', amount: '', disc: '', product: 'P2' });
  assert.equal(d.currency, 'OMR');
});

test('a quote brings its client, currency, validity, VAT and lines at their net amounts; subscriptions stay', () => {
  const d = { subs: [{ line: 'Plan' }], oneoff: [{ line: 'old' }], currency: 'USD', vat: '0' };
  applyQuote(d, {
    public_id: 'Q1', number: 'QT-0007', currency: 'OMR', exponent: 3, valid_until: '2026-11-27',
    contact: { public_id: 'C1', display_name: 'Sur Hotels' },
    lines: [
      { public_id: 'L1', description: 'Brass lamp', quantity: '2', line_net: 40000, tax_rate_bp: 500, product: { public_id: 'P1' } },
      { public_id: 'L2', description: 'Consultancy', quantity: '1', line_net: 45000, tax_rate_bp: 500, product: null },
    ],
  });
  assert.deepEqual([d.client, d.clientId, d.currency, d.valid, d.vat, d.quoteId, d.quoteNumber], ['Sur Hotels', 'C1', 'OMR', '2026-11-27', '5', 'Q1', 'QT-0007']);
  assert.deepEqual(d.oneoff, [
    { line: 'Brass lamp × 2', amount: '40', disc: '', product: 'P1', quoteLine: 'L1' },
    { line: 'Consultancy', amount: '45', disc: '', product: '', quoteLine: 'L2' },
  ]);
  assert.deepEqual(d.subs, [{ line: 'Plan' }]);
});

test('a draft quote has no number: its title names it; mixed VAT rates leave VAT alone', () => {
  const d = applyQuote({ vat: '5' }, { public_id: 'Q2', number: null, title: 'Draft quote — X', currency: 'OMR', lines: [
    { description: 'a', quantity: '1', line_net: 100, tax_rate_bp: 500 }, { description: 'b', quantity: '1', line_net: 100, tax_rate_bp: 0 }] });
  assert.equal(d.quoteNumber, 'Draft quote — X');
  assert.equal(d.vat, '5');
});

test('exchange rates become 1 <ccy> = rate <base>, the latest per currency, either direction', () => {
  const fx = fxFromRates([
    { from_currency: 'USD', to_currency: 'OMR', rate: '0.385', rate_date: '2026-10-01' },
    { from_currency: 'USD', to_currency: 'OMR', rate: '0.384', rate_date: '2026-10-20' },
    { from_currency: 'OMR', to_currency: 'EUR', rate: '2.4', rate_date: '2026-10-15' },
    { from_currency: 'SAR', to_currency: 'AED', rate: '0.98', rate_date: '2026-10-25' },
    { from_currency: 'GBP', to_currency: 'OMR', rate: '0', rate_date: '2026-10-25' },
  ], 'omr');
  assert.deepEqual(fx.rows, [{ ccy: 'USD', rate: '0.384' }, { ccy: 'EUR', rate: '0.41666667' }]);
  assert.equal(fx.asOf, '2026-10-20');
});
