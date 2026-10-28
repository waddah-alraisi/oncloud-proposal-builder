import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companyFromRecord, companyToRecord, duplicateRecord, fromRecord, imageFiles, newRecord, toRecord } from '../src/record.js';

const SCHEMA = JSON.parse(readFileSync(new URL('../schema/proposal-builder.schema.json', import.meta.url), 'utf8')).collections;
const ID = '01M60EEAX8RKX6KVG6T3E8A3F6';

const proposal = () => ({
  id: 'r1', created: 1, updated: 2, status: 'awaiting', ref: 'OC-PROP-2026-001', client: ' Sur Hotels ', clientId: ID, quoteId: ID,
  quoteNumber: 'QT-0007', currency: 'omr', valid: '2026-11-30', issued: 'soon', preparedBy: 'Waddah', version: '1.0',
  appendix: [{ ref: 'A', img: 'https://storage.example/x?sig', imgFile: 'F1' }, { ref: 'B', img: '' }],
  internal: { mandays: [{ role: 'Consultant', days: '10' }] },
  history: [{ t: 1, m: 'Proposal created' }],
});

test('a proposal becomes a row the schema takes: list fields copied out, the rest in content, no image addresses', () => {
  const row = toRecord(proposal(), { yearOne: 12345.6789, canSeeCosts: true });
  assert.deepEqual(
    [row.ref, row.client, row.client_id, row.quote_id, row.quote_number, row.status, row.currency, row.year_one, row.valid, row.issued, row.prepared_by],
    ['OC-PROP-2026-001', 'Sur Hotels', ID, ID, 'QT-0007', 'awaiting', 'OMR', 12345.679, '2026-11-30', null, 'Waddah'],
  );
  assert.equal(row.content.appendix[0].img, '');
  assert.equal(row.content.appendix[0].imgFile, 'F1');
  for (const k of ['internal', 'history', 'id', 'created', 'updated']) assert.equal(k in row.content, false, k);
  assert.deepEqual(row.internal, { mandays: [{ role: 'Consultant', days: '10' }] });
  for (const k of Object.keys(row)) assert.ok(SCHEMA.proposal.fields[k], `${k} is a field of the proposal collection`);
});

test('someone blind mode covers never sends the costing, so they cannot overwrite it', () => {
  assert.equal('internal' in toRecord(proposal(), { canSeeCosts: false }), false);
});

test('bad values become nulls the API accepts, not refusals', () => {
  const row = toRecord({ status: 'odd', currency: 'Omani', clientId: 'x', ref: 'R'.repeat(80) }, { yearOne: NaN });
  assert.deepEqual([row.status, row.currency, row.client_id, row.year_one, row.ref.length], ['draft', null, null, null, 60]);
});

test('a row becomes the builder\'s proposal, with the row\'s id, status, history and (when sent) costing', () => {
  const d = fromRecord({ id: 'r9', status: 'won', created_at: '2026-10-28T05:00:00Z', content: { ref: 'X', status: 'draft' }, history: [{ t: 1, m: 'a' }], internal: { risk: {} } });
  assert.deepEqual([d.id, d.ref, d.status, d.history.length, typeof d.internal, d.created], ['r9', 'X', 'won', 1, 'object', Date.parse('2026-10-28T05:00:00Z')]);
  assert.equal('internal' in fromRecord({ id: 'r1', content: {} }), false);
});

test('new and duplicated proposals are drafts with their own history', () => {
  assert.deepEqual(newRecord({ preparedBy: 'W' }).content, { preparedBy: 'W' });
  const copy = duplicateRecord({ id: 'r1', revision: 4, created_at: 'x', ref: 'R1', status: 'won', content: { ref: 'R1', client: 'C' }, internal: { a: 1 } });
  assert.deepEqual([copy.ref, copy.status, copy.content.client, copy.internal.a, 'id' in copy, 'revision' in copy], ['R1-copy', 'draft', 'C', 1, false, false]);
  assert.match(copy.history[0].m, /Duplicated from R1/);
});

test('the appendix images are found by their file ids', () => {
  assert.deepEqual(imageFiles(proposal()), [{ index: 0, id: 'F1' }]);
});

test('the company profile and its costing go to two fields; the costing only from someone who may see it', () => {
  const company = { name: 'OnCloud', cover: 'https://short-lived', coverFile: 'F2', clauses: { a: 'b' }, costing: { baseCcy: 'OMR' } };
  assert.deepEqual(companyToRecord(company, { canSeeCosts: true }), { profile: { name: 'OnCloud', coverFile: 'F2', clauses: { a: 'b' } }, costing: { baseCcy: 'OMR' } });
  assert.equal('costing' in companyToRecord(company), false);
  assert.deepEqual(companyFromRecord({ profile: { name: 'X' }, costing: { baseCcy: 'USD' } }), { name: 'X', costing: { baseCcy: 'USD' } });
  assert.equal(companyFromRecord(null), null);
  for (const k of Object.keys(companyToRecord(company, { canSeeCosts: true }))) assert.ok(SCHEMA.company.fields[k], k);
});
