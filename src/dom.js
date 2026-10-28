// The one way screens build DOM: never innerHTML, so text from the API is always text.
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

const nodes = (children) => children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false).map((c) => (c instanceof Node ? c : String(c)));

// replaceChildren, skipping empty children (replaceChildren itself writes them as the text "null").
export function fill(node, ...children) {
  node.replaceChildren(...nodes(children));
  return node;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  node.append(...nodes(children));
  return node;
}

export function options(values, selected, label = (v) => v) {
  return values.map((v) => el('option', { value: v, selected: v === selected }, label(v)));
}

// The form's named fields as an object; numbers for type=number, null for empty.
export function formValues(form) {
  const out = {};
  for (const input of form.elements) {
    if (!input.name) continue;
    if (input.type === 'number') out[input.name] = input.value === '' ? null : Number(input.value);
    else out[input.name] = input.value.trim() === '' ? null : input.value.trim();
  }
  return out;
}

// For the builder's string templates: text into HTML, never markup.
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
