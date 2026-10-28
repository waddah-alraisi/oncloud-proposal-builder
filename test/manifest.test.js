import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { proposalManifest } from '../src/manifest.js';

const VALIDATE = new URL('../../oncloud-ui/src/from-shell/app/validate.js', import.meta.url);
const SCHEMA = JSON.parse(readFileSync(new URL('../schema/proposal-builder.schema.json', import.meta.url), 'utf8')).collections;

test('the manifest passes OnCloud\'s own validator (the runtime refuses to boot otherwise)', { skip: !existsSync(VALIDATE) && 'needs ../oncloud-ui' }, async () => {
  globalThis.window ??= globalThis;
  globalThis.location ??= new URL('http://localhost/');
  const { validate } = await import(VALIDATE.href);
  assert.deepEqual(validate(proposalManifest()).errors, []);
});

test('every app screen names a component the app supplies', async () => {
  globalThis.document ??= { documentElement: {} };
  const { COMPONENTS } = await import('../src/screens/index.js');
  const named = Object.values(proposalManifest().screens).filter((s) => s.kind === 'app').map((s) => s.component);
  assert.deepEqual([...new Set(named)].sort(), Object.keys(COMPONENTS).sort());
});

test('every column the list reads is a field of the app\'s schema; the list filters only on indexed fields', () => {
  const SYSTEM = new Set(['id', 'revision', 'created_at']);
  const m = proposalManifest();
  for (const r of Object.values(m.resources)) {
    const collection = r.endpoint.replace('/data/', '');
    assert.ok(SCHEMA[collection], `no collection ${collection}`);
    for (const [key, f] of Object.entries(r.fields)) {
      if (!SYSTEM.has(key)) assert.ok(SCHEMA[collection].fields[f.column], `${key}: no field ${f.column}`);
    }
  }
  for (const s of Object.values(m.screens).filter((x) => x.kind === 'list')) {
    const collection = m.resources[s.resource].endpoint.replace('/data/', '');
    for (const f of s.filters ?? []) assert.ok((SCHEMA[collection].indexes ?? []).some((i) => i[0] === f), `${f} is not indexed`);
  }
});

test('the schema keeps the costing where blind mode can hide it', () => {
  assert.equal(SCHEMA.proposal.fields.internal.sensitive, true);
  assert.equal(SCHEMA.company.fields.costing.sensitive, true);
  assert.equal(SCHEMA.company.fields.profile.sensitive, undefined);
});
