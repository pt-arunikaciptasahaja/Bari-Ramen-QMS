import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Isolated correctness/scale exercise. PGlite serializes one connection: this
// deliberately does not claim a multi-connection hosted Postgres load benchmark.
test('550-party reminder batches drain fully without starvation or duplicate push jobs',async t=>{
 const db=new PGlite(); const staff=crypto.randomUUID();
 const guestCount=500, total=guestCount+50;
 const guests=Array.from({length:guestCount},()=>crypto.randomUUID());
 type Ticket={id:string;token:string;visit_token:string};const tickets:Ticket[]=[];
 const value=async<T>(sql:string,args:unknown[]=[]) => (await db.query<{v:T}>(sql,args)).rows[0].v;
 const user=async(id:string)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const register=async(request=crypto.randomUUID(),visit:string|null=null)=>value<Ticket>('select register_linked_customer($1,$2,$3,null,$4) v',['Audit fixture',7,request,visit]);
 const tick=()=>value<number>('select qms_private.advance_queue_calls() v');
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
   grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`);
  const folder=new URL('../supabase/migrations/',import.meta.url);
  for(const file of(await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
  await db.query('insert into auth.users select unnest($1::uuid[])',[[staff,...guests]]);
  await db.query('insert into staff_members values($1)',[staff]);
  await t.test('distinct customer registrations and retries retain unique consecutive numbers',async()=>{
   for(const guest of guests){
    await user(guest);const request=crypto.randomUUID();const r=await register(request);tickets.push(r);
    assert.equal((await register(request)).id,r.id);
   }
   await db.exec('reset role');
   assert.equal(await value<number>('select count(*)::int v from queue_entries'),guestCount);
   assert.equal(await value<number>('select max(ticket_sequence) v from queue_entries'),guestCount);
   assert.equal(await value<number>('select count(distinct queue_number)::int v from queue_entries'),guestCount);
  });
  await t.test('100 queued simultaneous retry requests reuse one active ticket',async()=>{
   await user(guests[0]);const results=await Promise.all(Array.from({length:100},()=>register()));
   assert.equal(new Set(results.map(r=>r.id)).size,1);assert.equal(results[0].id,tickets[0].id);
   await db.exec('reset role');assert.equal(await value<number>('select count(*)::int v from queue_entries'),guestCount);
  });
  await t.test('50 manual staff entries share A/B/C counters without changing self registrations',async()=>{
   await user(staff);
   for(let i=0;i<50;i++)await db.query("select enqueue('Staff audit fixture',$1,'walk-in',$2,null)",[i%3===0?2:i%3===1?4:7,crypto.randomUUID()]);
   await db.exec('reset role');
   assert.equal(await value<number>('select count(*)::int v from queue_entries'),total);
   const bad=await value<number>('select count(*)::int v from (select group_code,count(*) n,max(ticket_sequence) m from queue_entries group by group_code having count(*)<>max(ticket_sequence)) x');assert.equal(bad,0);
  });
  await t.test('100 subscriptions produce unique call jobs and due batches drain at configured volume',async()=>{
   for(let i=0;i<100;i++)await db.query("select save_push_subscription($1,$2,$3,$4)",[tickets[i].token,`https://fcm.googleapis.com/fcm/send/audit-${i}`,'B'.repeat(87),'A'.repeat(22)]);
   await db.exec("update qms_private.scheduler_config set enabled=true,call_policy_started_at='-infinity';update queue_entries set status='called',called_at=clock_timestamp()-interval '185 seconds'");
   assert.equal(await value<number>('select count(*)::int v from qms_private.push_jobs'),100);
   for(let remaining=total;remaining>0;remaining-=200)assert.equal(await tick(),Math.min(200,remaining));
   assert.equal(await tick(),0);
   assert.equal(await value<number>('select count(*)::int v from queue_entries where call_count=2'),total);
   assert.equal(await value<number>('select count(*)::int v from qms_private.push_jobs'),200);
  });
  await t.test('seating protects 50 parties while third calls and 10-minute no-show process the remainder',async()=>{
   await db.query("update queue_entries set status='seated' where id=any($1::uuid[])",[tickets.slice(0,50).map(r=>r.id)]);
   await db.exec("update queue_entries set called_at=clock_timestamp()-interval '365 seconds' where status='called'");
   for(let i=0;i<4;i++)await tick();
   assert.equal(await value<number>("select count(*)::int v from queue_entries where status='called' and call_count=3"),total-50);
   assert.equal(await value<number>('select count(*)::int v from qms_private.push_jobs'),250);
   assert.equal(await value<number>('select count(*)::int v from (select subscription_id,called_at,count(*) from qms_private.push_jobs group by subscription_id,called_at having count(*)>1)x'),0);
   await db.exec("update queue_entries set called_at=clock_timestamp()-interval '605 seconds' where status='called'");
   for(let i=0;i<4;i++)await tick();
   assert.equal(await value<number>("select count(*)::int v from queue_entries where status='no-show'"),total-50);
   assert.equal(await value<number>("select count(*)::int v from queue_entries where status='seated'"),50);
   assert.equal(await tick(),0);
  });
  await t.test('100 return visits get fresh numbers and their original links resolve the new active tickets',async()=>{
   for(let i=0;i<100;i++){
    await user(guests[i]);const next=await register(crypto.randomUUID(),tickets[i].visit_token);assert.notEqual(next.id,tickets[i].id);
    const resolved=await value<{token:string}>('select resolve_customer_visit($1) v',[tickets[i].visit_token]);assert.equal(resolved.token,next.token);
   }
   await db.exec('reset role');assert.equal(await value<number>('select count(*)::int v from queue_entries'),total+100);
   assert.equal(await value<number>('select count(distinct queue_number)::int v from queue_entries'),total+100);
  });

  await t.test('legacy 5/10/15-minute cycles also drain every overdue batch without touching seated parties',async()=>{
   // Re-age non-seated fixtures as old-policy calls; this stays inside PGlite.
   await db.exec("update qms_private.scheduler_config set call_policy_started_at=clock_timestamp();update queue_entries set status='called',call_count=1,called_at=clock_timestamp()-interval '305 seconds' where status<>'seated'");
   const due=total+100-50;
   for(let remaining=due;remaining>0;remaining-=200)assert.equal(await tick(),Math.min(200,remaining));
   assert.equal(await tick(),0);
   assert.equal(await value<number>("select count(*)::int v from queue_entries where status='called' and call_count=2"),due);
   await db.exec("update queue_entries set called_at=clock_timestamp()-interval '605 seconds' where status='called'");
   for(let remaining=due;remaining>0;remaining-=200)assert.equal(await tick(),Math.min(200,remaining));
   assert.equal(await tick(),0);
   assert.equal(await value<number>("select count(*)::int v from queue_entries where status='called' and call_count=3"),due);
   await db.exec("update queue_entries set called_at=clock_timestamp()-interval '905 seconds' where status='called'");
   for(let remaining=due;remaining>0;remaining-=200)assert.equal(await tick(),Math.min(200,remaining));
   assert.equal(await tick(),0);
   assert.equal(await value<number>("select count(*)::int v from queue_entries where status='seated'"),50);
  });

 }finally{await db.close();}
});
