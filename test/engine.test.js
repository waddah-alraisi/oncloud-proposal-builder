import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The engine in a browser-like page: jsdom has no layout, so pagination measures zero and every sheet stays whole.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame']) globalThis[k] ??= dom.window[k];
dom.window.HTMLDialogElement.prototype.showModal ??= function showModal() { this.open = true; };
dom.window.HTMLDialogElement.prototype.close ??= function close() { this.open = false; };

const { createBuilder } = await import('../src/builder/engine.js');
const { chrome } = await import('../src/views/builder.js');

function mount({ canSeeCosts = true, proposal = { id: 'r1', status: 'draft', client: 'Sur Hotels', ref: 'OC-1' }, can = {} } = {}) {
  const saved = [];
  const companies = [];
  const toasts = [];
  const root = document.createElement('div');
  root.className = 'pb';
  document.body.replaceChildren(root);
  const io = {
    proposal, company: null, canSeeCosts, t: (k) => k, toast: (m) => toasts.push(m), fail: (e) => toasts.push(e.message),
    workspace: { name: 'Sur Group', logo: 'https://api.oncloud.example/logo.png' }, defaultCover: '/cover.jpg',
    can: { contacts: true, products: true, quotes: true, rates: true, ...can },
    saveProposal: (d, yearOne) => saved.push({ d: structuredClone(d), yearOne }),
    saveCompany: (c) => companies.push(structuredClone(c)),
    uploadImage: async () => ({ id: 'F1', url: 'https://storage.example/f1' }),
    pickClient: async () => ({ public_id: '01M60EEAX8RKX6KVG6T3E8A3F6', display_name: 'Sur Hotels LLC' }),
    pickProduct: async () => ({ public_id: 'P1', name: 'Growth plan', amount: '1200', currency: 'OMR' }),
    pickQuote: async () => null,
    exchangeRates: async () => [{ from_currency: 'USD', to_currency: 'OMR', rate: '0.385', rate_date: '2026-10-20' }],
  };
  const engine = createBuilder({ root, io, chrome: chrome({ canSeeCosts, logo: io.workspace.logo }) });
  return { root, io, engine, saved, companies, toasts };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('it opens on the proposal: the steps, the A4 preview with the workspace\'s logo, the company named after the workspace', () => {
  const { root, engine } = mount();
  assert.ok(root.querySelectorAll('#steps .step').length >= 10);
  const sheets = root.querySelectorAll('#preview section.sheet');
  assert.ok(sheets.length > 3, 'cover and sections');
  assert.equal(sheets[0].querySelector('img.pb-mark')?.getAttribute('src'), 'https://api.oncloud.example/logo.png');
  assert.equal(sheets[0].querySelector('img.art')?.getAttribute('src'), '/cover.jpg');
  assert.equal(engine.company.name, 'Sur Group');
  assert.match(root.querySelector('#fileLabel').textContent, /Sur Hotels/);
  engine.destroy();
});

test('typing in a field saves the proposal, with its year-one total for the list', () => {
  const { root, saved, engine } = mount();
  const input = root.querySelector('[data-k="client"]');
  input.value = 'Sur Hotels SAOG';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(saved.at(-1).d.client, 'Sur Hotels SAOG');
  assert.equal(typeof saved.at(-1).yearOne, 'number');
  engine.destroy();
});

test('picking a client links the proposal to Contacts; a product becomes a priced line', async () => {
  const { root, saved, engine } = mount();
  root.querySelector('[data-pick="client"]').click();
  await flush();
  assert.equal(saved.at(-1).d.client, 'Sur Hotels LLC');
  assert.equal(saved.at(-1).d.clientId, '01M60EEAX8RKX6KVG6T3E8A3F6');
  assert.match(root.querySelector('.pb-links').textContent, /linkedClient/);

  // Commercial is where the product buttons are.
  [...root.querySelectorAll('#steps .step')].find((b) => /Commercial/.test(b.textContent)).click();
  root.querySelector('[data-pick="product"][data-into="subs"]').click();
  await flush();
  const subs = saved.at(-1).d.subs;
  assert.deepEqual(subs.at(-1), { line: 'Growth plan', basis: 'Per year', qty: '1', unit: '1200', disc: '', when: 'In advance', product: 'P1' });
  engine.destroy();
});

test('without the costing key the internal step and its buttons are gone, and the client buttons follow the scopes', () => {
  const { root, engine } = mount({ canSeeCosts: false, can: { contacts: false, quotes: false } });
  assert.ok(root.classList.contains('hide-internal'));
  assert.ok(![...root.querySelectorAll('#steps .step')].some((b) => /internal/i.test(b.textContent)));
  assert.equal(root.querySelector('#btnHideInt').hidden, true);
  assert.equal(root.querySelector('#btnExportCosts').hidden, true);
  assert.equal(root.querySelector('[data-pick="client"]'), null);
  engine.destroy();
});

test('the workspace\'s exchange rates fill the costing\'s FX table', async () => {
  const { root, companies, engine } = mount();
  engine.showCompany();
  root.querySelector('[data-pick="fx"]').click();
  await flush();
  assert.deepEqual(companies.at(-1).costing.fx, [{ ccy: 'USD', rate: '0.385' }]);
  assert.equal(companies.at(-1).costing.fxAsOf, '2026-10-20');
  engine.destroy();
});

test('printing puts the sheets alone on a host at the end of <body>, and takes it away after', () => {
  const { engine } = mount();
  window.dispatchEvent(new window.Event('beforeprint'));
  const host = document.body.querySelector(':scope > .pb-print');
  assert.ok(host && host.querySelectorAll('section.sheet').length > 3);
  assert.ok(document.body.classList.contains('pb-printing'));
  window.dispatchEvent(new window.Event('afterprint'));
  assert.equal(document.body.querySelector('.pb-print'), null);
  engine.destroy();
});
