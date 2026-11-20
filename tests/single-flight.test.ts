import test from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight } from '../src/lib/single-flight';

test('concurrent identical media requests share work but revisions stay separate', async () => {
  let calls = 0;
  const run = singleFlight((id: string, revision: string) => JSON.stringify([id, revision]),
    async (id: string, revision: string) => { calls++; return `${id}:${revision}`; });
  const results = await Promise.all([run('a', '1'), run('a', '1'), run('a', '2')]);
  assert.deepEqual(results, ['a:1', 'a:1', 'a:2']);
  assert.equal(calls, 2);
  await run('a', '1');
  assert.equal(calls, 3, 'completed work is not a stale persistent cache');
});

test('failed shared work is evicted and the next request can recover', async () => {
  let calls = 0;
  const run = singleFlight(() => 'image', async () => {
    if (++calls === 1) throw new Error('upstream unavailable');
    return 'recovered';
  });
  const results = await Promise.allSettled([run(), run()]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  assert.equal(await run(), 'recovered');
  assert.equal(calls, 2);
});
