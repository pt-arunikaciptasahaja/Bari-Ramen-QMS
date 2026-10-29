import test from 'node:test';
import assert from 'node:assert/strict';
import { reconnectPush, subscribeFromTap } from '../src/lib/client-push';

function fixture() {
  const requests: Record<string, unknown>[] = [];
  let hasSubscription=true, active=false, created=0;
  const subscription={ endpoint:'https://fcm.googleapis.com/test',toJSON:()=>({endpoint:'https://fcm.googleapis.com/test',keys:{}}) };
  const registration={pushManager:{getSubscription:async()=>hasSubscription?subscription:null,subscribe:()=>{created++;return Promise.resolve(subscription);}}} as unknown as ServiceWorkerRegistration;
  return {registration,requests,setHas:(v:boolean)=>{hasSubscription=v;},setActive:(v:boolean)=>{active=v;},created:()=>created,
    request:async(body:Record<string,unknown>)=>{requests.push(body);return {active};}};
}
test('Android / installed iOS existing consent reconnects to the new ticket without prompting',async()=>{
  const f=fixture();
  assert.equal(await reconnectPush(f.registration,'new-ticket',f.request,false,'granted'),true);
  assert.deepEqual(f.requests.map(r=>[r.action,r.ticketToken]),[['status','new-ticket'],['subscribe','new-ticket']]);
  assert.equal(f.created(),0);
  f.requests.length=0;f.setActive(true);
  assert.equal(await reconnectPush(f.registration,'new-ticket',f.request,false,'granted'),true);
  assert.deepEqual(f.requests.map(r=>r.action),['status']);
});
test('disabled, denied, unprompted and missing subscriptions never reconnect silently',async()=>{
  for(const [disabled,permission] of [[true,'granted'],[false,'denied'],[false,'default']] as const){
    const f=fixture();assert.equal(await reconnectPush(f.registration,'ticket',f.request,disabled,permission),false);
    assert.equal(f.requests.length,0);assert.equal(f.created(),0);
  }
  const f=fixture();f.setHas(false);
  assert.equal(await reconnectPush(f.registration,'ticket',f.request,false,'granted'),false);
  assert.equal(f.requests.length,0);assert.equal(f.created(),0);
});
test('subscribe runs synchronously within the tap before any awaited operation',async()=>{
  const f=fixture();const pending=subscribeFromTap(f.registration,'AQID');
  assert.equal(f.created(),1);await pending;
});
test('network failure is surfaced and a later resume can reconnect',async()=>{
  const f=fixture();
  await assert.rejects(reconnectPush(f.registration,'ticket',async()=>{throw Error('offline');},false,'granted'),/offline/);
  assert.equal(await reconnectPush(f.registration,'ticket',f.request,false,'granted'),true);
});
