import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document ??= { documentElement: {} };
const { saver } = await import('../src/views/builder.js');

test('saves the latest state once, on the revision the last save returned', async () => {
  const calls = [];
  const row = { id: 'r1', revision: 1 };
  const s = saver({ row, wait: 5, onError: () => {}, save: async (r, c) => { calls.push([r.revision, c.n]); return { revision: r.revision + 1 }; } });
  s.queue({ n: 1 }); s.queue({ n: 2 });
  await s.flush();
  s.queue({ n: 3 });
  await s.flush();
  assert.deepEqual(calls, [[1, 2], [2, 3]]);
});

test('stops after a revision conflict instead of overwriting someone else\'s change', async () => {
  const errors = [];
  let n = 0;
  const s = saver({ row: { id: 'r1', revision: 1 }, wait: 5, onError: (e) => errors.push(e.message), save: async () => { n += 1; throw new Error('appregistry.revision_conflict'); } });
  s.queue({}); await s.flush();
  s.queue({}); await s.flush();
  assert.deepEqual([n, errors, s.stopped], [1, ['appregistry.revision_conflict'], true]);
});
