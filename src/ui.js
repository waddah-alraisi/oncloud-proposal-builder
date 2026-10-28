// The app's building blocks, drawn with @oncloud/ui (loaded by index.html, on globalThis.OnCloudUI). Read lazily, so
// modules that never draw still load in Node tests.
import { el } from './dom.js';
import { explain } from './errors.js';
import { t } from './i18n.js';

export function UI() {
  const ui = globalThis.OnCloudUI;
  if (!ui) throw new Error('oncloud_ui_not_loaded');
  return ui;
}

export function button(label, onClick, { variant = 'primary', size = 'md', icon = null, disabled = false, type = 'button', title = null } = {}) {
  return UI().ButtonComponent.new({ label, variant, size, icon, disabled, type, title, onClick }).element;
}

export function confirmDelete(title) {
  return UI().confirmModal({ title, danger: true, confirmLabel: t('delete'), cancelLabel: t('cancel') });
}

export function toaster(region) {
  return (errorOrText, extra = []) => {
    const isText = typeof errorOrText === 'string';
    const info = isText ? null : explain(errorOrText);
    // An error this app wrote itself (a sentence, no server envelope) is said as written.
    const own = !isText && !errorOrText?.envelope && info.key === 'errGeneric' && /\s/.test(String(errorOrText?.message ?? ''));
    const lines = isText ? [errorOrText] : [own ? errorOrText.message : t(info.key), ...extra, ...(extra.length ? [] : info.general)];
    const node = el('div', {
      class: `toast rounded-lg px-4 py-3 text-sm shadow-md ${isText ? 'ok bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bad bg-red-50 text-red-800 dark:bg-red-500/15 dark:text-red-200'}`,
      role: isText ? 'status' : 'alert',
    }, lines.map((l) => el('p', {}, l)));
    region.append(node);
    setTimeout(() => node.remove(), isText ? 2500 : 7000);
  };
}

// Latin digits in both languages: @oncloud/ui's number cells follow the browser's locale ("٠" in an Arabic
// browser). Fixed in oncloud-shell; this stays until the app moves to the release that carries it.
export function registerLatinNumbers() {
  UI().registerFormatter('number', (v) => document.createTextNode(v == null || v === '' ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 })));
}
