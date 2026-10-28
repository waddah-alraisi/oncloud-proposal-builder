// A proposal as the builder holds it ⇄ a `proposal` row in OnCloud; the company profile ⇄ the `company` row. Pure, so
// Node tests it. What a list shows and filters on is copied into the row's own fields (ref, client, status, …); the
// rest rides in `content`. The costing goes in `internal` (sensitive: blind mode hides it from anyone without the
// workspace's costing key) and is never sent by someone who could not read it.

const MAX = { ref: 60, client: 200, prepared_by: 120, version: 20, quote_number: 40 };
const STATUSES = ['draft', 'awaiting', 'active', 'won', 'lost'];

const text = (v, max) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s.slice(0, max);
};
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);
const ccy = (v) => (/^[A-Z]{3}$/.test(String(v ?? '').trim().toUpperCase()) ? String(v).trim().toUpperCase() : null);
const id26 = (v) => (/^[0-9A-Za-z]{26}$/.test(String(v ?? '')) ? String(v) : null);

/** The images' short-lived addresses are not kept: their file ids are, and the address is fetched on open. */
function withoutAddresses(content) {
  const out = { ...content };
  if (Array.isArray(out.appendix)) out.appendix = out.appendix.map((r) => (r && r.imgFile ? { ...r, img: '' } : r));
  return out;
}

/** The row to save. `yearOne`: the builder's year-one total (the list's value column). */
export function toRecord(data, { yearOne = null, canSeeCosts = false } = {}) {
  const { internal, history, id, created, updated, ...content } = data;
  return {
    ref: text(data.ref, MAX.ref),
    client: text(data.client, MAX.client),
    client_id: id26(data.clientId),
    quote_id: id26(data.quoteId),
    quote_number: text(data.quoteNumber, MAX.quote_number),
    status: STATUSES.includes(data.status) ? data.status : 'draft',
    currency: ccy(data.currency),
    year_one: Number.isFinite(yearOne) ? Math.round(yearOne * 1000) / 1000 : null,
    valid: day(data.valid),
    issued: day(data.issued),
    prepared_by: text(data.preparedBy, MAX.prepared_by),
    version: text(data.version, MAX.version),
    content: withoutAddresses(content),
    history: Array.isArray(history) ? history.slice(-200) : [],
    ...(canSeeCosts && internal ? { internal } : {}),
  };
}

/** The builder's proposal from a row: its content, with the row's id, status and history. */
export function fromRecord(row) {
  const content = row.content && typeof row.content === 'object' ? row.content : {};
  const when = Date.parse(row.created_at ?? '');
  return {
    ...content,
    id: row.id,
    status: row.status || content.status || 'draft',
    history: Array.isArray(row.history) ? row.history : [],
    ...(row.internal && typeof row.internal === 'object' ? { internal: row.internal } : {}),
    ...(Number.isFinite(when) ? { created: when } : {}),
  };
}

/** A new proposal's row: a draft, with the person who made it as its author. */
export function newRecord({ preparedBy = '' } = {}) {
  return { status: 'draft', prepared_by: text(preparedBy, MAX.prepared_by), content: { preparedBy }, history: [{ t: Date.now(), m: 'Proposal created' }] };
}

/** A copy of a row as a new draft. */
export function duplicateRecord(row) {
  const content = { ...(row.content ?? {}), ref: `${row.content?.ref ?? row.ref ?? ''}-copy`, status: 'draft' };
  return {
    ...Object.fromEntries(Object.entries(row).filter(([k]) => !['id', 'revision', 'created_at', 'updated_at', '_files'].includes(k))),
    ref: text(content.ref, MAX.ref),
    status: 'draft',
    content,
    history: [{ t: Date.now(), m: `Duplicated from ${row.ref || 'an earlier proposal'}` }],
  };
}

/** The file ids the proposal's images live in: [{ index, id }] for the appendix rows that have one. */
export function imageFiles(data) {
  return (data.appendix || []).map((r, index) => ({ index, id: r?.imgFile })).filter((x) => x.id);
}

// ---- the company profile ------------------------------------------------------------------------------------------

/** The `company` row's two fields: the profile everyone uses, and the costing only costing holders see. */
export function companyToRecord(company, { canSeeCosts = false } = {}) {
  const { costing, cover, ...profile } = company;
  return { profile, ...(canSeeCosts && costing ? { costing } : {}) };
}

export function companyFromRecord(row) {
  if (!row) return null;
  return { ...(row.profile ?? {}), ...(row.costing ? { costing: row.costing } : {}) };
}
