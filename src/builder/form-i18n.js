// The builder's form in the reader's language. The engine writes its form in English (src/builder/engine.js); when
// the reader's OnCloud language is Arabic, this rewrites what it rendered — text, placeholders, aria-labels, titles —
// from src/builder/form-ar.js, as it is drawn. Never the A4 preview (the document prints in the proposal's own
// language), never what a person typed (input values, textareas), never an option's value: only what is read.
import { EXACT, KEEP, TEMPLATES } from './form-ar.js';

const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = '#preview, #measure, textarea, script, style, datalist';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(templates) {
  return templates.map(([en, ar, mode]) => {
    const names = [];
    const body = en.split(/(\{[a-z]\})/).map((part) => {
      const m = /^\{([a-z])\}$/.exec(part);
      if (!m) return escapeRe(part);
      names.push(m[1]);
      return '(.+?)';
    }).join('');
    return { re: new RegExp(`^${body}$`, 's'), ar, names, split: mode === 'split' };
  });
}

/** translate(text) → the Arabic for one piece of the form's text, or the text itself when there is none. */
export function translator(exact = EXACT, templates = TEMPLATES) {
  const compiled = compile(templates);
  const translate = (text) => {
    const key = text.trim();
    if (!key || !/[A-Za-z]/.test(key) || KEEP.test(key)) return text;
    const hit = exact[key];
    if (hit !== undefined) return text.replace(key, hit);
    for (const t of compiled) {
      const m = t.re.exec(key);
      if (!m) continue;
      const values = Object.fromEntries(t.names.map((n, i) => [n, t.split ? translate(m[i + 1]) : m[i + 1]]));
      return text.replace(key, t.ar.replace(/\{([a-z])\}/g, (_, n) => values[n] ?? ''));
    }
    return text;
  };
  return translate;
}

/** Rewrite one subtree of the form. */
export function translateTree(node, translate) {
  if (!node || (node.nodeType === 1 && node.closest(SKIP))) return;
  if (node.nodeType === 3) {
    if (node.parentElement?.closest(SKIP)) return;
    const next = translate(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== 1 && node.nodeType !== 11) return;
  const walker = node.ownerDocument.createTreeWalker(node, 1 | 4, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? 2 : 1),
  });
  for (let n = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === 3) {
      const next = translate(n.nodeValue);
      if (next !== n.nodeValue) n.nodeValue = next;
    } else if (n.nodeType === 1) {
      for (const a of ATTRS) {
        const v = n.getAttribute(a);
        if (v) {
          const next = translate(v);
          if (next !== v) n.setAttribute(a, next);
        }
      }
    }
  }
}

/**
 * Keep a builder's form in Arabic as the engine redraws it: everything already there, then every node it adds (a
 * step, the costing panel after a keystroke, a dialog's text). Returns the stop function.
 */
export function arabicForm(root) {
  const translate = translator();
  translateTree(root, translate);
  const observer = new root.ownerDocument.defaultView.MutationObserver((records) => {
    for (const r of records) for (const n of r.addedNodes) translateTree(n, translate);
  });
  observer.observe(root, { childList: true, subtree: true });
  return { translate, stop: () => observer.disconnect() };
}
