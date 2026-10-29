import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('server call cycle, outbox, authorization, recovery and terminal-state safety',async(t)=>{
  const db=new PGlite();
  const staff='10000000-0000-4000-8000-000000000001',secret='b'.repeat(64);
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`);
    const folder=new URL('../supabase/migrations/',import.meta.url);
    for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
    await db.query('insert into auth.users values($1)',[staff]);
    await db.query('insert into staff_members values($1)',[staff]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[staff]);
    const value=async<T>(sql:string,args:unknown[]=[]) => (await db.query<{v:T}>(sql,args)).rows[0].v;
    async function create(){
      const r=await value<{id:string}>("select to_jsonb(enqueue('Scheduler fixture',2,'walk-in',$1)) as v",[crypto.randomUUID()]);
      const token=await value<string>('select staff_ticket_token($1) as v',[r.id]);
      await db.query("select save_push_subscription($1,'https://fcm.googleapis.com/fcm/send/scheduler-'||$2,$3,$4)",[token,r.id,'B'.repeat(87),'A'.repeat(22)]);
      await db.query("select transition_queue($1,'called')",[r.id]);
      return {...r,token};
    }
    const row=async(id:string)=>value<{status:string;call_count:number;called_at:string;last_call_at:string}>("select to_jsonb(q) as v from queue_entries q where id=$1",[id]);
    const tick=()=>value<number>('select qms_private.advance_queue_calls() as v');
    async function age(id:string,seconds:number){
      await db.query("update queue_entries set called_at=clock_timestamp()-($2*interval '1 second'),last_call_at=clock_timestamp()-($2*interval '1 second') where id=$1",[id,seconds]);
    }
    await db.exec("update qms_private.scheduler_config set call_policy_started_at='-infinity'");
    const first=await create();
    await t.test('minute zero is one committed call with one push job, dormant scheduler changes nothing',async()=>{
      assert.equal((await row(first.id)).call_count,1);
      await age(first.id,301);assert.equal(await tick(),0);assert.equal((await row(first.id)).call_count,1);
    });
    await db.query("update qms_private.scheduler_config set enabled=true,worker_secret_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",[secret]);
    await t.test('3/6/10-minute boundaries and repeated ticks preserve first call timestamp',async()=>{
      await age(first.id,179);await tick();assert.equal((await row(first.id)).call_count,1);
      await age(first.id,180.1);const anchor=(await row(first.id)).called_at;
      await tick();assert.equal((await row(first.id)).call_count,2);
      assert.equal(String((await row(first.id)).called_at),String(anchor));
      assert.equal(await tick(),0);
      await age(first.id,359);await tick();assert.equal((await row(first.id)).call_count,2);
      await age(first.id,360.1);await tick();assert.equal((await row(first.id)).call_count,3);
      assert.equal(await value<number>('select count(*)::int as v from qms_private.push_jobs where ticket_id=$1',[first.id]),3);
      await age(first.id,599);await tick();assert.equal((await row(first.id)).status,'called');
      await age(first.id,600.1);await tick();assert.equal((await row(first.id)).status,'no-show');
      assert.equal((await row(first.id)).call_count,3);assert.equal(await tick(),0);
    });
    await t.test('existing calls retain their fifteen-minute deadline',async()=>{
      await db.exec("update qms_private.scheduler_config set call_policy_started_at=clock_timestamp()");
      const r=await create();await age(r.id,660);await tick();assert.equal((await row(r.id)).status,'called');
      await age(r.id,901);await tick();assert.equal((await row(r.id)).status,'no-show');
      await db.exec("update qms_private.scheduler_config set call_policy_started_at='-infinity'");
    });
    await t.test('seating before deadline stops reminders and no-show',async()=>{
      const r=await create();await db.query("select transition_queue($1,'seated')",[r.id]);
      await age(r.id,1000);await tick();assert.equal((await row(r.id)).status,'seated');
      assert.equal((await row(r.id)).call_count,1);
    });
    await t.test('staff cannot assign a table after the deadline while awaiting the next scheduler tick',async()=>{
      const r=await create();await age(r.id,601);
      await assert.rejects(db.query("select transition_queue($1,'seated')",[r.id]),/Batas kedatangan/);
      await tick();assert.equal((await row(r.id)).status,'no-show');
    });
    await t.test('late recovery skips reminder backlog and expired calls never send',async()=>{
      const r=await create();await age(r.id,400);await tick();assert.equal((await row(r.id)).call_count,3);
      assert.equal(await value<number>('select count(*)::int as v from qms_private.push_jobs where ticket_id=$1',[r.id]),2);
      const expired=await create();await age(expired.id,960);await tick();assert.equal((await row(expired.id)).status,'no-show');
      assert.equal(await value<number>('select count(*)::int as v from qms_private.push_jobs where ticket_id=$1',[expired.id]),1);
    });
    await t.test('legacy called rows and waiting rows are never automatically rewritten',async()=>{
      const r=await create();await db.query('update queue_entries set call_count=0 where id=$1',[r.id]);await age(r.id,1000);await tick();
      assert.equal((await row(r.id)).status,'called');assert.equal((await row(r.id)).call_count,0);
    });
    await t.test('public worker RPC rejects missing/wrong secrets and private scheduler execution',async()=>{
      await db.exec('set role anon');
      await assert.rejects(db.query('select worker_claim_push($1)',['x'.repeat(64)]),/Akses worker/);
      await assert.rejects(db.exec('select qms_private.advance_queue_calls()'),/permission denied/);
      await assert.rejects(db.exec('select * from qms_private.scheduler_config'),/permission denied/);
      await db.exec('reset role');
    });
    await t.test('HTTP receipts expire and are consumed once without exposing permanent credentials',async()=>{
      const expired=await value<string>("insert into qms_private.worker_requests(expires_at) values(clock_timestamp()-interval '1 second') returning id as v");
      assert.deepEqual(await value('select worker_claim_request($1,$2) as v',[secret,expired]),[]);
      const receipt=await value<string>('insert into qms_private.worker_requests default values returning id as v');
      await value('select worker_claim_request($1,$2) as v',[secret,receipt]);
      assert.deepEqual(await value('select worker_claim_request($1,$2) as v',[secret,receipt]),[]);
      await db.exec('set role anon');await assert.rejects(db.exec('select * from qms_private.worker_requests'),/permission denied/);await db.exec('reset role');
    });
    await t.test('claim is atomic, lease fencing rejects stale acknowledgements and retry is bounded',async()=>{
      const r=await create();
      const jobs=await value<{id:string;ticket_id:string;lease_token:string}[]>('select worker_claim_push($1) as v',[secret]);
      const job=jobs.find(j=>j.ticket_id===r.id)!;assert.ok(job);
      assert.deepEqual(await value('select worker_claim_push($1) as v',[secret]),[]);
      await db.query("select worker_finish_push($1,$2,$3,'accepted',201)",[secret,job.id,crypto.randomUUID()]);
      assert.equal(await value('select state as v from qms_private.push_jobs where id=$1',[job.id]),'sending');
      await db.query("update qms_private.push_jobs set leased_at=clock_timestamp()-interval '61 seconds' where id=$1",[job.id]);
      const retried=(await value<typeof jobs>('select worker_claim_push($1) as v',[secret])).find(j=>j.id===job.id)!;
      assert.notEqual(retried.lease_token,job.lease_token);
      await db.query("select worker_finish_push($1,$2,$3,'accepted',201)",[secret,job.id,job.lease_token]);
      assert.equal(await value('select state as v from qms_private.push_jobs where id=$1',[job.id]),'sending');
      await db.query("select worker_finish_push($1,$2,$3,'accepted',201)",[secret,job.id,retried.lease_token]);
      assert.equal(await value('select state as v from qms_private.push_jobs where id=$1',[job.id]),'accepted');
      const ticket=await value<Record<string,unknown>>('select customer_ticket($1) as v',[r.token]);
      assert.equal(ticket.call_count,1);assert.equal('customer_name' in ticket,false);assert.equal('customer_phone' in ticket,false);
      const board=await value<Record<string,unknown>>('select to_jsonb(q) as v from queue_board q where id=$1',[r.id]);
      assert.equal(board.call_count,1);assert.equal('customer_phone' in board,false);
    });
  } finally {await db.close();}
});
