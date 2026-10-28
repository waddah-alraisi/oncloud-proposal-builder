import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keys } from '../src/i18n.js';
import { abilities, dataUrlToBlob } from '../src/data.js';
import { explain } from '../src/errors.js';

test('every word exists in both languages', () => {
  assert.deepEqual(keys('ar').filter((k) => !keys('en').includes(k)), []);
  assert.deepEqual(keys('en').filter((k) => !keys('ar').includes(k)), []);
});

test('Arabic strings carry Latin digits only', async () => {
  const { readFileSync } = await import('node:fs');
  assert.doesNotMatch(readFileSync('src/i18n.js', 'utf8'), /[٠-٩۰-۹]/);
});

test('the scopes the install granted switch the links on, one by one', () => {
  assert.deepEqual(abilities(['data:rw', 'contacts:r']), { contacts: true, products: false, quotes: false, rates: false, files: false });
  assert.deepEqual(abilities(['contacts:r', 'products:r', 'sales:r', 'drive:rw']), { contacts: true, products: true, quotes: true, rates: true, files: true });
});

test('a downscaled image becomes bytes without fetch()', async () => {
  const blob = dataUrlToBlob('data:image/jpeg;base64,/9j/4AA=');
  assert.equal(blob.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [0xff, 0xd8, 0xff, 0xe0, 0x00]);
});

test('a workspace that has not bought the app, or a key the person lacks, is said in words', () => {
  assert.equal(explain(Object.assign(new Error('appregistry.not_in_package'), { envelope: {} })).key, 'errPackage');
  assert.equal(explain(Object.assign(new Error('auth.forbidden'), { envelope: {} })).key, 'errForbidden');
});
