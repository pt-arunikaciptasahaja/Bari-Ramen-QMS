import test from 'node:test';
import assert from 'node:assert/strict';
import { SlideCache } from '../src/lib/slide-cache';
const entry = (version: string, bytes = 4) => ({version,etag:'"digest"',blob:new Blob([new Uint8Array(bytes)])});
test('rotations reuse blobs; revisions replace them and deleted slides are removed',()=>{
  const cache=new SlideCache(16), original=entry('1');
  cache.set('a',original);
  assert.equal(cache.get('a')?.blob,original.blob);
  cache.set('a',entry('2')); assert.equal(cache.get('a')?.version,'2');
  cache.set('b',entry('1')); cache.retain(new Set(['b']));
  assert.equal(cache.get('a'),undefined); assert.ok(cache.get('b'));
  cache.clear(); assert.equal(cache.get('b'),undefined);
});
test('image cache evicts to its byte budget and rejects oversized images',()=>{
  const cache=new SlideCache(8);
  cache.set('a',entry('1'));cache.set('b',entry('1'));cache.set('c',entry('1'));
  assert.equal(cache.get('a'),undefined);assert.ok(cache.get('b'));assert.ok(cache.get('c'));
  cache.set('c',entry('2',9));assert.equal(cache.get('c'),undefined);
  cache.set('d',entry('1'));assert.ok(cache.get('b'));assert.ok(cache.get('d'));
});
