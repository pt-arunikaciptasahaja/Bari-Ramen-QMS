import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import webpush from 'web-push';
import {validatePushSubscription} from '../src/lib/push-validation';

const ec=createECDH('prime256v1');ec.generateKeys();
const key=ec.getPublicKey().toString('base64url'),auth=Buffer.alloc(16,7).toString('base64url');
const endpoint='https://fcm.googleapis.com/fcm/send/test-device';
const subscription={endpoint,keys:{p256dh:key,auth}};
test('push endpoints and keys reject SSRF, wrong schemes, credentials and malformed keys',()=>{
  assert.deepEqual(validatePushSubscription(subscription),subscription);
  for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])
    assert.throws(()=>validatePushSubscription({...subscription,endpoint}));
  assert.throws(()=>validatePushSubscription({...subscription,keys:{p256dh:'bad',auth}}));
});
test('web-push produces encrypted payload and VAPID authentication without network calls',()=>{
  const vapid=webpush.generateVAPIDKeys();
  const request=webpush.generateRequestDetails(subscription,JSON.stringify({body:'Test'}),{
    TTL:60,vapidDetails:{subject:'https://example.com',publicKey:vapid.publicKey,privateKey:vapid.privateKey},
  });
  assert.equal(request.headers['TTL'],60);
  assert.match(String(request.headers.Authorization),/vapid/);
  assert.ok(request.body && request.body.length>20);
  assert.equal(request.body?.includes(Buffer.from('Test')),false);
});
test('service worker displays background pushes and safely opens the private ticket',async()=>{
  const handlers:Record<string,(event:unknown)=>void>={};
  const notifications:unknown[][]=[];const opened:string[]=[];
  const self={addEventListener:(name:string,handler:(event:unknown)=>void)=>{handlers[name]=handler;},skipWaiting:()=>{},
    location:{origin:'https://example.com'},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async(url:string)=>{opened.push(url);}},
    registration:{showNotification:async(...args:unknown[])=>{notifications.push(args);}}};
  runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Date});
  let promise=Promise.resolve();
  handlers.push({data:{json:()=>({title:'Giliran Anda',body:'A-001',url:'/ticket#t='+'a'.repeat(64),expiresAt:Date.now()+60000})},waitUntil:(p:Promise<void>)=>{promise=p;}});
  await promise;assert.equal(notifications[0][0],'Giliran Anda');
  const options=notifications[0][1] as {data:{url:string}};
  handlers.notificationclick({notification:{close:()=>{},data:options.data},waitUntil:(p:Promise<void>)=>{promise=p;}});
  await promise;assert.equal(opened[0],'https://example.com/ticket#t='+'a'.repeat(64));
  handlers.push({data:{json:()=>({title:'Old call',url:'https://evil.test',expiresAt:1})},waitUntil:(p:Promise<void>)=>{promise=p;}});
  await promise;assert.equal(notifications[1][0],'Periksa antrean Bari Ramen');
  assert.equal((notifications[1][1] as {data:{url:string}}).data.url,'/ticket');
});

test('push subscription access, outbox deduplication, leases, retries and consent controls',async(t)=>{
  const db=new PGlite(),staff='10000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`);
    const folder=new URL('../supabase/migrations/',import.meta.url);
    for(const f of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,folder),'utf8'));
    await db.query('insert into auth.users values($1)',[staff]);await db.query('insert into staff_members values($1)',[staff]);
    async function asStaff(){await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[staff]);}
    async function anon(){await db.exec('reset role;set role anon');await db.query("select set_config('request.jwt.claim.sub','',false)");}
    async function call<T>(sql:string,args:unknown[]=[]){return(await db.query<{v:T}>(sql,args)).rows[0]?.v;}
    await asStaff();
    const ticket=await call<{id:string}>("select to_jsonb(enqueue('Push Test',2,'walk-in',$1)) as v",[crypto.randomUUID()]);
    const token=await call<string>('select staff_ticket_token($1) as v',[ticket.id]);
    const hash=createHash('sha256').update(endpoint).digest('hex');
    const save=(tokenValue:string,url=endpoint)=>call('select save_push_subscription($1,$2,$3,$4) as v',[tokenValue,url,key,auth]);
    await anon();
    await t.test('public visitors need a private ticket capability and cannot read subscription tables',async()=>{
      await assert.rejects(save('a'.repeat(64)),/Tiket tidak aktif/);
      await assert.rejects(save(token,'https://127.0.0.1/internal'),/Perangkat tidak valid/);
      await assert.rejects(db.exec('select * from qms_private.push_subscriptions'),/permission denied/);
      await assert.rejects(call('select claim_push_jobs($1) as v',[ticket.id]),/permission denied/);
    });
    await save(token);await save(token);
    assert.equal(await call('select ticket_push_status($1,$2) as v',[token,hash]),true);
    await t.test('subscription upsert is idempotent and limited to three devices per ticket',async()=>{
      await save(token,endpoint+'2');await save(token,endpoint+'3');
      await assert.rejects(save(token,endpoint+'4'),/Batas perangkat/);
    });
    await t.test('test notifications require that ticket and have a 30-second cooldown',async()=>{
      assert.ok(await call('select push_test_target($1,$2) as v',[token,hash]));
      await assert.rejects(call('select push_test_target($1,$2) as v',[token,hash]),/Tunggu/);
    });
    await asStaff();await call("select transition_queue($1,'called') as v",[ticket.id]);
    const jobs=await call<{id:string}[]>('select claim_push_jobs($1) as v',[ticket.id]);
    await t.test('call trigger enqueues each device once and prevents simultaneous duplicate dispatch',async()=>{
      assert.equal(jobs.length,3);assert.deepEqual(await call('select claim_push_jobs($1) as v',[ticket.id]),[]);
      await assert.rejects(call("select transition_queue($1,'called') as v",[ticket.id]),/Status sudah berubah/);
    });
    await call("select finish_push_job($1,'accepted',201) as v",[jobs[0].id]);
    await call("select finish_push_job($1,'failed',503) as v",[jobs[1].id]);
    await call("select finish_push_job($1,'dead',410) as v",[jobs[2].id]);
    await db.exec('reset role');await db.exec("update qms_private.push_jobs set leased_at=clock_timestamp()-interval '20 seconds' where state='failed'");
    await asStaff();
    const retry=await call<{id:string}[]>('select claim_push_jobs($1) as v',[ticket.id]);
    assert.equal(retry.length,1);assert.equal(retry[0].id,jobs[1].id);
    await t.test('completed tickets stop dispatch and are no longer subscribable',async()=>{
      await call("select transition_queue($1,'seated') as v",[ticket.id]);
      assert.deepEqual(await call('select claim_push_jobs($1) as v',[ticket.id]),[]);
      await anon();await assert.rejects(save(token),/Tiket tidak aktif/);
      assert.equal(await call('select ticket_push_status($1,$2) as v',[token,hash]),false);
      await call('select remove_push_subscription($1,$2) as v',[token,hash]);
    });
  }finally{await db.close();}
});
