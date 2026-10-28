import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The builder's form in Arabic: every step, the costing panel, the company profile and the import/export dialog,
// drawn with data that brings out their variants, must show no English left — apart from what the person typed,
// money (a currency code and a number), codes kept as they are (API, OMR…) and the A4 preview (the document prints
// in the proposal's own language).
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'getComputedStyle', 'requestAnimationFrame', 'MutationObserver']) globalThis[k] ??= dom.window[k];
dom.window.HTMLDialogElement.prototype.showModal ??= function showModal() { this.open = true; };
dom.window.HTMLDialogElement.prototype.close ??= function close() { this.open = false; };

const { createBuilder } = await import('../src/builder/engine.js');
const { chrome } = await import('../src/views/builder.js');
const { arabicForm, translator } = await import('../src/builder/form-i18n.js');
const { KEEP } = await import('../src/builder/form-ar.js');
const { setLocale } = await import('../src/i18n.js');
setLocale('ar');

const tick = () => new Promise((r) => setTimeout(r, 0));
const MONEY = /^(−\s*)?[A-Z]{3} [−\d,.\-]+( · [A-Z]{3} [−\d,.\-]+)*( · [−\d,.\-]+%)?$/;
const DATE = /^[\d/,:. ]+(AM|PM)?$/;

const rich = () => ({
  id: 'r1', status: 'awaiting', client: 'Sur', ref: 'R', currency: 'OMR', initialTerm: '36', valid: '2020-01-01',
  timeline: [{ phase: 'Discovery', start: '2026-11-01', finish: '2026-12-01', gate: 'x' }],
  subs: [{ line: 'Plan', basis: 'Per company, per year', qty: '1', unit: '4800', when: 'In advance' }, { line: 'Seats', basis: 'Per user, per year', qty: '20', unit: '30', disc: '10%', when: 'Monthly in advance' }],
  oneoff: [{ line: 'Impl', amount: '2500', disc: '500' }],
  addons: [{ line: 'Gazette', basis: 'One-off', amount: '1', accepted: false }],
  packages: [{ name: 'A', price: '1', basis: 'year one', items: 'x', pick: true }, { name: 'B', price: '2', basis: 'year one', items: 'y', pick: false }],
  appendix: [{ ref: 'A', doc: 'Profile', att: 'Yes', img: 'x', imgFile: 'F' }], changeAllowance: '10', discountValue: '5%',
  internal: {
    mandays: [{ phase: 'Build', role: 'Consultant', days: '10', day: '' }], infra: [{ item: 'Server', provider: 'Acme', qty: '1', amount: '100', ccy: 'USD', basis: 'Monthly', months: '' }],
    licences: [{ item: 'Lic', qty: '1', amount: '5', ccy: 'USD', basis: 'Annual' }], aiPackages: [{ item: 'Pack', amount: '1', ccy: 'USD', basis: 'Monthly' }],
    aiProduct: [{ feature: 'Assistant', model: 'm', users: '10', reqs: '5', inTok: '100', outTok: '100' }], aiDelivery: [{ tool: 'Agent', model: 'm', monthly: '20', ccy: 'USD' }],
    other: [{ item: 'Travel', amount: '1', ccy: 'EUR', basis: 'One-off' }], actuals: [{ month: '2026-11', people: '1' }], risk: { pct: '5' }, fees: { pct: '2' },
    supportRole: 'Consultant', supportDays: '2', aiSell: 'Plan',
  },
});
const company = () => ({ costing: { baseCcy: 'OMR', rateCard: [{ role: 'Consultant', day: '' }], fx: [{ ccy: 'USD', rate: '0.385' }], aiModels: [{ model: 'm', in: '3', out: '15', ccy: 'USD' }], fxAsOf: '2026-01-01', aiAsOf: '' } });
const edge = () => {
  const p = rich();
  Object.assign(p, { initialTerm: '12', timeline: [], milestones: [{ name: 'All', trigger: 'Sign', share: '100' }], subs: [{ line: 'Plan', qty: '1', unit: '10', when: 'In advance' }], oneoff: [{ line: 'Impl', amount: '1' }] });
  Object.assign(p.internal, {
    termYears: '5', aiSell: 'Plan', aiProduct: [{ feature: 'Assistant', model: '', users: '10' }], actuals: [{ month: '2026-11', people: '900000' }, { month: '2026-12', people: '1' }],
    mandays: ['B', 'C', 'D', 'E', 'F'].map((phase, i) => ({ phase, role: `Role${i}`, days: i ? '1' : '400', day: '' })),
  });
  return p;
};
const STATES = [
  ['rich', rich(), company()],
  ['empty', { id: 'e' }, null],
  ['edge', edge(), { costing: { baseCcy: 'OMR', rateCard: [], fx: [], aiModels: [{ model: 'm', in: '3', out: '15', ccy: 'USD' }], fxAsOf: '', aiAsOf: '2020-01-01', targetMargin: '35' } }],
];

// Every string the state itself holds is the person's own text, shown as they wrote it.
function ownText(...objects) {
  const out = new Set(['W', 'Sur Group']);
  const walk = (v) => { if (typeof v === 'string') out.add(v.trim()); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  objects.forEach(walk);
  return out;
}

// What may stay in Latin letters: the person's own text, money, dates, and the codes and units an Arabic sentence
// keeps as they are (OMR, SLA, RPO, ISO 27001, PDF, A4, v3, .json, UTC+4, om-mct-1, Ctrl/Cmd+C).
const CODE = /\.json|om-mct-\d+|\bv\d+\b|Ctrl\/Cmd\+C|\bOnCloud\b|\bUTC\+\d+|\b(?:OMR|USD|EUR|SAR|AED|SLA|RPO|RTO|ISO|PDF|JSON|API|A4|AI|SDK|KB|GST)\b/g;
function english(root, own) {
  const left = new Set();
  const mine = [...own].filter((o) => /[A-Za-z]/.test(o)).sort((x, y) => y.length - x.length);
  const consider = (t) => {
    let s = t.trim();
    const shown = s;
    if (!s || !/[A-Za-z]/.test(s) || KEEP.test(s) || MONEY.test(s) || DATE.test(s)) return;
    for (const o of mine) s = s.replace(new RegExp(`(?<![A-Za-z])${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'gi'), ' ');
    s = s.replace(/[A-Z]{3} [−\d,.\-]+/g, ' ').replace(CODE, ' ');
    if (/[A-Za-z]{2,}/.test(s)) left.add(shown);
  };
  const w = document.createTreeWalker(root, 1 | 4);
  for (let n = w.currentNode; n; n = w.nextNode()) {
    if (n.nodeType === 1 && n.closest('#preview, #measure, textarea, datalist')) continue;
    if (n.nodeType === 3) { if (!n.parentElement.closest('#preview, #measure, textarea, datalist, script, style')) consider(n.nodeValue); }
    else for (const a of ['placeholder', 'aria-label', 'title']) consider(n.getAttribute(a) || '');
  }
  return left;
}

async function walkEverything(proposal, comp) {
  const toasts = [];
  const root = document.createElement('div');
  root.className = 'pb';
  root.dir = 'rtl';
  document.body.replaceChildren(root);
  const form = arabicForm(root);
  const io = {
    proposal: structuredClone(proposal), company: comp && structuredClone(comp), canSeeCosts: true, t: (k) => k,
    toast: (m) => toasts.push(form.translate(String(m))), fail: () => {}, workspace: { name: 'W', logo: '' }, defaultCover: '/c.jpg',
    can: {}, saveProposal() {}, saveCompany() {}, uploadImage: async () => ({}), exchangeRates: async () => [],
  };
  const engine = createBuilder({ root, io, chrome: chrome({ canSeeCosts: true, logo: '' }) });
  const own = ownText(proposal, comp, engine.company, engine.data);
  const left = new Map();
  const note = (where) => { for (const s of english(root, own)) if (!left.has(s)) left.set(s, where); };
  await tick();
  note('chrome');
  const count = root.querySelectorAll('#steps .step').length;
  for (let i = 0; i < count; i += 1) {
    root.querySelectorAll('#steps .step')[i].click();
    await tick();
    note(`step ${i}`);
  }
  engine.showCompany();
  await tick();
  note('company');
  for (const b of ['#btnExport', '#btnImport', '#btnExportCosts']) { root.querySelector(b).click(); await tick(); note(b); }
  root.querySelector('#btnHideInt').click();
  await tick();
  note('hidden');
  for (const t of toasts) if (/[A-Za-z]/.test(t) && !KEEP.test(t)) left.set(t, 'toast');
  engine.destroy();
  form.stop();
  return left;
}

for (const [name, proposal, comp] of STATES) {
  test(`the form in Arabic leaves no English behind — ${name}`, async () => {
    const left = await walkEverything(proposal, comp);
    assert.deepEqual([...left].map(([s, w]) => `${w}: ${s}`), []);
  });
}

test('only what is read changes: option values, input values and the preview stay as they are', async () => {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const form = arabicForm(root);
  const engine = createBuilder({ root, io: {
    proposal: rich(), company: company(), canSeeCosts: true, t: (k) => k, toast() {}, fail() {}, workspace: { name: 'W', logo: '' }, defaultCover: '/c.jpg',
    can: {}, saveProposal() {}, saveCompany() {}, uploadImage: async () => ({}), exchangeRates: async () => [],
  }, chrome: chrome({ canSeeCosts: true, logo: '' }) });
  await tick();
  const status = root.querySelector('#f-status');
  assert.equal(status.value, 'awaiting');
  assert.equal(status.selectedOptions[0].textContent, 'أُرسل — بانتظار الرد');
  assert.equal(root.querySelector('[data-k="client"]').value, 'Sur');
  assert.equal(root.querySelector('#stepCount').textContent, 'الخطوة 1 من 11');
  assert.match(root.querySelector('#preview').textContent, /COMMERCIAL IN CONFIDENCE/);
  [...root.querySelectorAll('#steps .step')].find((b) => /العرض المالي/.test(b.textContent)).click();
  await tick();
  const when = root.querySelector('[data-arr="subs"][data-f="when"]');
  assert.equal(when.value, 'In advance');
  assert.equal(when.selectedOptions[0].textContent, 'مقدمًا');
  engine.destroy();
  form.stop();
});

test('templates carry their numbers and names over, and a split line translates each part', () => {
  const tr = translator();
  assert.equal(tr('Step 3 of 11'), 'الخطوة 3 من 11');
  assert.equal(tr('No exchange rate for USD, EUR — those rows count as zero.'), 'لا يوجد سعر صرف لـ USD, EUR — تُحتسب تلك الصفوف صفرًا.');
  assert.equal(tr('Sur Hotels · OC-1 · Sent — awaiting response'), 'Sur Hotels · OC-1 · أُرسل — بانتظار الرد');
  assert.equal(tr('  Next  '), '  التالي  ');
  assert.equal(tr('Status: Closed won'), 'الحالة: مغلق — فوز');
  assert.equal(tr('Something new'), 'Something new');
});
