import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../src/app/api/queue/worker/route';

test('worker HTTP authorization fails closed for missing, wrong, malformed and Unicode bearer tokens',async()=>{
  const original=process.env.QMS_WORKER_SECRET;
  process.env.QMS_WORKER_SECRET='a'.repeat(64);
  try {
    for(const auth of ['', 'Bearer '+'b'.repeat(64), 'a'.repeat(64), 'Bearer '+'é'.repeat(64)]) {
      const result=await POST(new Request('https://example.com/api/queue/worker',{method:'POST',headers:{authorization:auth}}));
      assert.equal(result.status,401);
    }
    delete process.env.QMS_WORKER_SECRET;
    assert.equal((await POST(new Request('https://example.com/api/queue/worker',{method:'POST'}))).status,401);
  } finally {if(original===undefined)delete process.env.QMS_WORKER_SECRET;else process.env.QMS_WORKER_SECRET=original;}
});
