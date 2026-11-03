import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {validWorkerRequest} from '../src/lib/worker-auth';
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

test('signed HTTP requests validate timestamps, signatures, receipts and reject permanent bearer tokens',()=>{
  const secret='a'.repeat(64),now=1792607700000,stamp=String(now/1000),receipt='10000000-0000-4000-8000-000000000001';
  const signature=createHmac('sha256',secret).update(`${stamp}:${receipt}`).digest('hex');
  const headers=new Headers({'x-qms-timestamp':stamp,'x-qms-receipt':receipt,'x-qms-signature':signature});
  assert.equal(validWorkerRequest(headers,secret,now),true);
  assert.equal(validWorkerRequest(headers,secret,now+30001),false);
  assert.equal(validWorkerRequest(headers,secret,now-5001),false);
  assert.equal(validWorkerRequest(headers,'b'.repeat(64),now),false);
  assert.equal(validWorkerRequest(headers,undefined,now),false);
  headers.set('x-qms-receipt','20000000-0000-4000-8000-000000000001');
  assert.equal(validWorkerRequest(headers,secret,now),false);
  headers.set('x-qms-signature','é'.repeat(64));assert.equal(validWorkerRequest(headers,secret,now),false);
});
