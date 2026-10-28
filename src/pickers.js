// Choosing one of the workspace's records — a client, a product, a quote — in @oncloud/ui's dialog: a search box and
// the matching records as a radio list, searched on OnCloud as the person types (ADR 0053's read routes).
import { el, fill } from './dom.js';
import { t } from './i18n.js';
import { UI } from './ui.js';

// @oncloud/ui's own choice list (modal.js), so a picker reads like OnCloud's other "which one" dialogs.
const CHOICES = '-space-y-px rounded-md bg-white dark:bg-gray-800/50';
const CHOICE = 'group flex cursor-pointer border border-gray-200 p-4 first:rounded-t-md last:rounded-b-md '
  + 'has-checked:relative has-checked:border-brand-200 has-checked:bg-brand-50 '
  + 'dark:border-gray-700 dark:has-checked:border-brand-800 dark:has-checked:bg-brand-500/10';
const RADIO = 'relative mt-0.5 size-4 shrink-0 appearance-none rounded-full border border-gray-300 bg-white '
  + 'before:absolute before:inset-1 before:rounded-full before:bg-white not-checked:before:hidden '
  + 'checked:border-brand-600 checked:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 '
  + 'focus-visible:outline-brand-600 dark:border-white/10 dark:bg-white/5 dark:checked:border-brand-500 '
  + 'dark:checked:bg-brand-500 forced-colors:appearance-auto forced-colors:before:hidden';
const CHOICE_LABEL = 'block text-sm font-medium text-gray-900 group-has-checked:text-brand-900 dark:text-white dark:group-has-checked:text-brand-300';
const CHOICE_NOTE = 'block text-sm text-gray-500 dark:text-gray-400';

let n = 0;

/**
 * pick({ title, load: async (q) => rows, label: row => text, note: row => text }) → the chosen row, or null.
 * The first page loads at once; typing searches again (250 ms after the last key).
 */
export function pick({ title, load, label, note = () => '' }) {
  const name = `pb-pick-${(n += 1)}`;
  const rows = new Map();
  const list = el('fieldset', { class: `${CHOICES} mt-3 max-h-[70vh] overflow-y-auto`, 'aria-label': title });
  const status = el('p', { class: 'mt-3 text-sm text-gray-500 dark:text-gray-400', role: 'status' }, t('loading'));
  const box = el('input', { type: 'search', class: `${UI().CONTROL} py-1.5`, placeholder: t('typeToSearch'), 'aria-label': t('search'), autocomplete: 'off' });

  let seq = 0;
  async function search(q) {
    const mine = (seq += 1);
    status.textContent = t('loading');
    try {
      const found = await load(q);
      if (mine !== seq) return;
      rows.clear();
      fill(list, found.map((row, i) => {
        const key = String(row.public_id ?? i);
        rows.set(key, row);
        return el('label', { class: CHOICE },
          el('input', { type: 'radio', name, value: key, class: RADIO, checked: i === 0 }),
          el('span', { class: 'ms-3 flex flex-col' }, el('span', { class: CHOICE_LABEL }, label(row)), note(row) ? el('span', { class: CHOICE_NOTE, dir: 'auto' }, note(row)) : null));
      }));
      status.textContent = found.length ? '' : t('noResults');
    } catch (e) {
      if (mine === seq) status.textContent = `${t('failed')} (${e.message})`;
    }
  }

  let timer = null;
  box.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(box.value.trim()), 250); });
  search('');

  const chosen = () => rows.get(list.querySelector('input:checked')?.value ?? '') ?? null;
  return UI().openModal({
    title,
    content: el('div', {}, box, list, status),
    wide: true,
    onMount: () => box.focus(),
    buttons: [
      { label: t('select'), value: 'ok', variant: 'primary', check: () => chosen() !== null },
      { label: t('cancel'), value: null, variant: 'secondary', escape: true },
    ],
  }).then((answer) => (answer === 'ok' ? chosen() : null));
}
