// One proposal, in the builder: the record from OnCloud, the workspace's brand and company profile, and the links to
// its contacts, products and quotes, handed to the engine (src/builder/engine.js) as `io`. Every change is saved back
// to the record (debounced, on the record's revision); the costing only by someone blind mode does not cover.
import { createBuilder } from '../builder/engine.js';
import { arabicForm } from '../builder/form-i18n.js';
import { applyFiles, loadCompany, saveCompany } from '../company.js';
import * as db from '../data.js';
import { escapeHtml as h } from '../dom.js';
import { applyQuote, major } from '../builder/links.js';
import { pick } from '../pickers.js';
import { duplicateRecord, fromRecord, imageFiles, newRecord, toRecord } from '../record.js';
import { locale, t } from '../i18n.js';
import { confirmDelete } from '../ui.js';

const SAVE_AFTER = 800;
// The builder on the page now: one at a time, so a redraw never leaves a second one listening.
let current = null;

// The builder's own chrome: its toolbar, the two panes and its two dialogs, in OnCloud's look (src/builder/builder.css).
export function chrome({ canSeeCosts, logo }) {
  const hidden = canSeeCosts ? '' : ' hidden';
  return `
<div class="pb-bar">
  <div class="pb-title">${logo ? `<img class="pb-logo" src="${h(logo)}" alt="">` : ''}<span class="file" id="fileLabel">—</span></div>
  <button class="btn" id="btnHideInt"${hidden}>${h(t('hideInternal'))}</button>
  <button class="btn" id="btnCompany">${h(t('company'))}</button>
  <button class="btn" id="btnImport">${h(t('import'))}</button>
  <button class="btn" id="btnExport">${h(t('export'))}</button>
  <button class="btn internal" id="btnExportCosts"${hidden}>${h(t('exportCosts'))}</button>
  <button class="btn" id="btnDuplicate">${h(t('duplicate'))}</button>
  <button class="btn" id="btnDelete">${h(t('delete'))}</button>
  <button class="btn primary" id="btnPrint">${h(t('print'))}</button>
</div>
<div class="wrap" id="buildView">
  <main class="pane form-pane">
    <nav class="steps" id="steps" aria-label="Proposal sections"></nav>
    <div id="stepBody"></div>
    <div class="navbtns">
      <button class="btn light" id="btnPrev">Back</button>
      <span class="hint" id="stepCount"></span>
      <button class="btn light" id="btnNext">Next</button>
    </div>
  </main>
  <aside class="pane preview-pane" id="preview" aria-label="Live preview"></aside>
  <div id="measure" aria-hidden="true"></div>
</div>
<dialog id="dlgIo">
  <h2 id="ioTitle">Export</h2>
  <p class="hint" id="ioHint" style="margin:0 0 12px"></p>
  <input type="file" id="ioFile" accept="application/json,.json" style="margin-bottom:10px">
  <textarea id="ioText" spellcheck="false"></textarea>
  <div class="dlg-acts">
    <button class="btn light" id="ioCopy">Copy</button>
    <button class="btn light" id="ioDownload">Download .json</button>
    <button class="btn primary" id="ioLoad">Load this JSON</button>
    <button class="btn light" id="ioClose">Close</button>
  </div>
</dialog>
<dialog id="dlgCompany">
  <h2>${h(t('companyProfile'))}</h2>
  <p class="hint" style="margin:0 0 12px">${h(t('companyNote'))}${canSeeCosts ? '' : ` ${h(t('costsHidden'))}`}</p>
  <div id="companyBody" style="max-height:58vh;overflow:auto;display:flex;flex-direction:column;gap:14px"></div>
  <div class="dlg-acts">
    <button class="btn ghost" id="coReset">Reset to defaults</button>
    <button class="btn primary" id="coClose">Done</button>
  </div>
</dialog>`;
}

// Saves one record in order: the latest state wins, never two PATCHes on the same revision.
export function saver({ row, save, onError, wait = SAVE_AFTER }) {
  let timer = null;
  let pending = null;
  let running = Promise.resolve();
  let stopped = false;
  const run = () => {
    if (!pending || stopped) return running;
    const changes = pending;
    pending = null;
    running = running.then(async () => {
      try {
        const saved = await save(row, changes);
        row.revision = saved.revision;
      } catch (e) {
        if (e.message === 'appregistry.revision_conflict') stopped = true;
        onError(e);
      }
    });
    return running;
  };
  return {
    queue(changes) { pending = changes; clearTimeout(timer); timer = setTimeout(run, wait); },
    flush() { clearTimeout(timer); return run(); },
    get stopped() { return stopped; },
  };
}

async function currencyExponents() {
  try {
    return new Map((await db.currencies()).map((c) => [c.code, c.exponent]));
  } catch {
    return new Map();
  }
}

export async function builderView(ctx) {
  current?.destroy();

  const [row, company, settings, exponents, can] = await Promise.all([
    db.get('proposal', ctx.params.id), loadCompany(), db.settings(), currencyExponents(), db.reachable(db.abilities(ctx.me?.scopes ?? [])),
  ]);
  const canSeeCosts = settings.blind_mode !== true;
  const exp = (code) => exponents.get(String(code || '').toUpperCase()) ?? 2;

  const data = fromRecord(row);
  // The images' addresses are short-lived: fetched now, from the file ids the record keeps.
  await Promise.all(imageFiles(data).map(async ({ index, id }) => {
    try { data.appendix[index].img = await db.fileUrl(id); } catch { data.appendix[index].img = ''; }
  }));
  await applyFiles(company.value);

  const save = saver({
    row,
    save: (r, changes) => db.update('proposal', r, changes),
    onError: (e) => ctx.toast(e.message === 'appregistry.revision_conflict' ? new Error(t('conflict')) : e),
  });

  const io = {
    proposal: data,
    company: company.value,
    workspace: { name: ctx.me?.tenant?.name ?? '', logo: ctx.me?.tenant?.logo_url ?? '' },
    defaultCover: '/cover.jpg',
    canSeeCosts,
    can,
    t,
    toast: (m) => ctx.toast(m),
    fail: (e) => ctx.toast(e),
    saveProposal: (d, yearOne) => save.queue(toRecord(d, { yearOne, canSeeCosts })),
    saveCompany: (c) => saveCompany(company, c, { canSeeCosts }).catch((e) => ctx.toast(e)),
    uploadImage: async (dataUrl, name) => {
      const id = await db.upload(db.dataUrlToBlob(dataUrl), name);
      return { id, url: await db.fileUrl(id) };
    },
    pickClient: () => pick({
      title: t('pickClientTitle'),
      load: db.contacts,
      label: (c) => c.display_name,
      note: (c) => [c.primary_email, c.unique_code].filter(Boolean).join(' · '),
    }),
    pickProduct: async (currency) => {
      const p = await pick({
        title: t('pickProductTitle'),
        load: db.products,
        label: (r) => r.display_name,
        note: (r) => [r.sku, r.price ? `${major(r.price.amount, exp(r.price.currency))} ${r.price.currency}` : t('noPrice')].filter(Boolean).join(' · '),
      });
      if (!p) return null;
      // The price in the proposal's currency when the workspace has one; else the list price as it stands.
      let amount = p.price?.currency === currency || !currency ? p.price?.amount ?? null : null;
      let code = p.price?.currency ?? currency;
      if (currency) {
        try {
          const resolved = await db.price(p.public_id, currency);
          if (resolved?.amount !== null && resolved?.amount !== undefined) { amount = resolved.amount; code = resolved.currency; }
        } catch { /* no price in that currency: the line is added without one */ }
      }
      return { public_id: p.public_id, name: p.display_name, amount: amount === null ? null : major(amount, exp(code)), currency: code };
    },
    pickQuote: async () => {
      const q = await pick({
        title: t('pickQuoteTitle'),
        load: db.quotes,
        label: (r) => r.number || r.title,
        note: (r) => [r.contact?.display_name, r.total !== undefined ? `${major(r.total, exp(r.currency))} ${r.currency}` : '', r.status].filter(Boolean).join(' · '),
      });
      if (!q) return null;
      const full = await db.quote(q.public_id);
      return { ...full, exponent: exp(full.currency) };
    },
    exchangeRates: db.exchangeRates,
  };

  const holder = document.createElement('div');
  holder.className = 'pb';
  // The form follows the reader's language (Arabic: right to left, src/builder/form-ar.js, applied as it is drawn);
  // the document prints in the proposal's own language and direction (each sheet carries its dir), whatever the app's.
  const arabic = locale() === 'ar';
  holder.dir = arabic ? 'rtl' : 'ltr';
  holder.lang = arabic ? 'ar' : 'en';
  const form = arabic ? arabicForm(holder) : null;
  if (form) io.toast = (m) => ctx.toast(typeof m === 'string' ? form.translate(m) : m);
  const engine = createBuilder({ root: holder, io, chrome: chrome({ canSeeCosts, logo: io.workspace.logo }) });

  holder.querySelector('#btnDuplicate').addEventListener('click', async () => {
    await save.flush();
    const copy = await db.create('proposal', duplicateRecord(await db.get('proposal', row.id)));
    ctx.toast(t('duplicated'));
    ctx.go(`/proposals/${copy.id}`);
  });
  holder.querySelector('#btnDelete').addEventListener('click', async () => {
    if (!(await confirmDelete(t('deleteProposal')))) return;
    await save.flush();
    await db.remove('proposal', row.id);
    ctx.toast(t('deleted'));
    ctx.go('/proposals');
  });

  const onHide = () => { if (document.visibilityState === 'hidden') save.flush(); };
  document.addEventListener('visibilitychange', onHide);
  let gone = false;
  const mine = {
    destroy() {
      if (gone) return;
      gone = true;
      save.flush();
      document.removeEventListener('visibilitychange', onHide);
      engine.destroy();
      form?.stop();
      if (current === mine) current = null;
    },
  };
  current = mine;
  holder.onDestroy = () => mine.destroy();
  return holder;
}

// /proposals/new: a draft made at once, then opened — a proposal is written in the builder, not in a form.
export async function newProposalView(ctx) {
  const created = await db.create('proposal', newRecord({ preparedBy: ctx.me?.user?.name ?? '' }));
  queueMicrotask(() => ctx.go(`/proposals/${created.id}`));
  const p = document.createElement('p');
  p.className = 'text-sm text-gray-600 dark:text-gray-400';
  p.textContent = t('creating');
  return p;
}

// /proposals/from-quote/:quote — where a quote's "Make a proposal" in OnCloud lands (ADR 0054). The proposal already
// built from that quote, when there is one; else a new one from it: its client, currency, validity, VAT and lines.
export async function fromQuoteView(ctx) {
  const quoteId = ctx.params.quote;
  const p = document.createElement('p');
  p.className = 'text-sm text-gray-600 dark:text-gray-400';
  try {
    const existing = await db.list('proposal', { 'filters[quote_id]': quoteId, per_page: 1 });
    if (existing[0]) {
      queueMicrotask(() => ctx.go(`/proposals/${existing[0].id}`));
      p.textContent = t('loading');
      return p;
    }
    const [quote, exponents] = await Promise.all([db.quote(quoteId), currencyExponents()]);
    const content = applyQuote({ preparedBy: ctx.me?.user?.name ?? '' }, { ...quote, exponent: exponents.get(quote.currency) ?? 2 });
    const row = toRecord({ ...content, status: 'draft' }, { canSeeCosts: false });
    row.history = [
      { t: Date.now(), m: 'Proposal created' },
      { t: Date.now(), m: `Built from quote ${content.quoteNumber}` },
    ];
    const created = await db.create('proposal', row);
    queueMicrotask(() => ctx.go(`/proposals/${created.id}`));
    p.textContent = t('creating');
  } catch (e) {
    p.className = 'text-sm text-red-700 dark:text-red-300';
    p.textContent = `${t(e.message === 'auth.forbidden' || e.message === 'appregistry.scope_not_granted' ? 'fromQuoteForbidden' : 'fromQuoteFailed')} (${e.message})`;
  }
  return p;
}
