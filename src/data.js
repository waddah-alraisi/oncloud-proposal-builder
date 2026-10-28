// The app's calls to OnCloud. Its own records: /connected/data/{proposal|company} (schema/proposal-builder.schema.json).
// The workspace's, read-only (ADR 0053): /connected/workspace/{contacts,products,quotes,exchange-rates}. Files: the
// app's own Drive (/connected/files). Thin on purpose: the rules (blind mode on costs, row revisions) live in OnCloud.
import { api, request } from './oncloud.js';

export const qs = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ---- the app's records -------------------------------------------------------------------------------------------

export const list = (collection, params = {}) => api(`/connected/data/${collection}${qs({ per_page: 100, ...params })}`);
export const get = (collection, id) => api(`/connected/data/${collection}/${id}`);
export const create = (collection, body) => api(`/connected/data/${collection}`, { method: 'POST', body });
// A change carries the revision it was made on: someone else's change in between is refused, not overwritten.
export const update = (collection, row, changes) => api(`/connected/data/${collection}/${row.id}`, { method: 'PATCH', body: { ...changes, revision: row.revision } });
export const remove = (collection, id) => api(`/connected/data/${collection}/${id}`, { method: 'DELETE' });
export const settings = () => api('/connected/settings');

// ---- files: OnCloud's storage handshake (begin, the bytes straight to storage, confirm), and a short-lived address ----

export async function upload(blob, name) {
  const begun = await api('/connected/files', { method: 'POST', body: { original_name: name, content_type: blob.type || 'application/octet-stream', size: blob.size } });
  const up = begun.upload;
  const form = new FormData();
  for (const [k, v] of Object.entries(up.fields || {})) form.append(k, v);
  form.append('file', blob, name);
  const sent = await fetch(up.url, { method: up.method || 'POST', body: form });
  if (!sent.ok) throw new Error(`storage_refused_${sent.status}`);
  const confirmed = await api(`/connected/files/${begun.file}/confirm`, { method: 'POST' });
  return confirmed.id ?? begun.file;
}

export const fileUrl = async (id) => (await api(`/connected/files/${id}/download`)).url;

// A downscaled image (a data: URL from the builder's canvas) as bytes to upload — decoded here, because the page's
// content policy lets fetch() reach OnCloud and its storage only.
export function dataUrlToBlob(dataUrl) {
  const [head, body = ''] = String(dataUrl).split(',');
  const type = /^data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = head.includes(';base64') ? atob(body) : decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// ---- the workspace's own records, read-only -------------------------------------------------------------------

const search = (q) => (q ? { 'filters[q]': q } : {});
export const contacts = (q) => api(`/connected/workspace/contacts${qs({ per_page: 20, ...search(q) })}`);
export const products = (q) => api(`/connected/workspace/products${qs({ per_page: 20, ...search(q) })}`);
export const price = (id, currency) => api(`/connected/workspace/products/${id}/price/resolve${qs({ currency })}`);
export const quotes = (q) => api(`/connected/workspace/quotes${qs({ per_page: 20, ...search(q) })}`);
export const quote = (id) => api(`/connected/workspace/quotes/${id}`);
export const exchangeRates = async () => (await request(`/connected/workspace/exchange-rates${qs({ per_page: 100 })}`)).data;
export const currencies = () => api('/connected/currencies');

// The scopes the app holds in this workspace, as the features they switch on (a scope the install did not grant
// hides its button rather than failing on a click).
export function abilities(scopes = []) {
  const has = (s) => scopes.includes(s);
  return { contacts: has('contacts:r'), products: has('products:r'), quotes: has('sales:r'), rates: has('sales:r'), files: has('drive:rw') };
}

// What this person may read, on top of the scopes: their own keys and the workspace's modules decide (ADR 0053), so
// each link is tried once — one row — and a refusal (403, 402) hides its button instead of failing on a click.
export async function reachable(can) {
  const probe = async (on, path) => {
    if (!on) return false;
    try { await api(`${path}${qs({ per_page: 1 })}`); return true; } catch { return false; }
  };
  const [contactsOk, productsOk, quotesOk, ratesOk] = await Promise.all([
    probe(can.contacts, '/connected/workspace/contacts'),
    probe(can.products, '/connected/workspace/products'),
    probe(can.quotes, '/connected/workspace/quotes'),
    probe(can.rates, '/connected/workspace/exchange-rates'),
  ]);
  return { ...can, contacts: contactsOk, products: productsOk, quotes: quotesOk, rates: ratesOk };
}
