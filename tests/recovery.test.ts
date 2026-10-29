import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('staff recovery preserves identity, audits edits and isolates obsolete call cycles',async(t)=>{
  const db=new PGlite();
  const staff='10000000-0000-4000-8000-000000000001',guest='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
  type Ticket={id:string;queue_number:string;status:string;edit_count:number;created_at:string;called_at:string|null;last_call_at:string|null;call_count:number;push_status:string|null;customer_phone:string;ticket_sequence:number};
  const value=async<T>(sql:string,args:unknown[]=[]) => (await db.query<{v:T}>(sql,args)).rows[0].v;
  async function actor(id:string,role='authenticated'){
    await db.exec(`reset role;set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  }
  const row=(id:string)=>value<Ticket>('select to_jsonb(q) as v from queue_entries q where id=$1',[id]);
  async function create(){return value<Ticket>("select to_jsonb(enqueue('Recovery fixture',2,'walk-in',$1,'081234567890')) as v",[crypto.randomUUID()]);}
  const transition=(id:string,status:string)=>value<Ticket>('select to_jsonb(transition_queue($1,$2)) as v',[id,status]);
  const restore=(snapshot:Ticket,reason='staff-error',note='',request=crypto.randomUUID())=>value<Ticket>('select to_jsonb(restore_queue($1,$2,$3,$4,$5,$6)) as v',[snapshot.id,snapshot.status,snapshot.edit_count,reason,note,request]);
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`);
    const folder=new URL('../supabase/migrations/',import.meta.url);
    for(const file of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,folder),'utf8'));
    await db.query('insert into auth.users values($1),($2),($3)',[staff,guest,other]);
    await db.query('insert into staff_members values($1)',[staff]);await actor(staff);
    let first=await create();const original={...first};
    const token=await value<string>('select staff_ticket_token($1) as v',[first.id]);
    await db.query("select save_push_subscription($1,'https://fcm.googleapis.com/fcm/send/recovery',$2,$3)",[token,'B'.repeat(87),'A'.repeat(22)]);
    first=await transition(first.id,'called');
    const leased=await value<{id:string;lease_token:string}[]>('select claim_push_jobs($1) as v',[first.id]);
    await t.test('guest and public visitors cannot recover tickets or inspect staff audit',async()=>{
      await actor(guest);await assert.rejects(restore(first),/Akses staf/);
      await assert.rejects(db.query('select queue_edit_history($1)',[first.id]),/Akses staf/);
      await assert.rejects(db.exec('select * from qms_private.queue_edits'),/permission denied/);
      await actor('','anon');await assert.rejects(restore(first),/permission denied/);
      await assert.rejects(db.query('select queue_edit_history($1)',[first.id]),/permission denied/);
      await actor(staff);
    });
    const request=crypto.randomUUID(),snapshot={...first};
    await t.test('cancel a mistaken call into waiting with immutable identity and an audit marker',async()=>{
      first=await restore(snapshot,'staff-error','  Salah klik panggilan  ',request);
      assert.equal(first.status,'waiting');assert.equal(first.edit_count,1);assert.equal(first.call_count,0);
      assert.equal(first.called_at,null);assert.equal(first.last_call_at,null);assert.equal(first.push_status,null);
      for(const key of ['id','queue_number','created_at','customer_phone','ticket_sequence'] as const)assert.equal(first[key],original[key]);
      const history=await value<{reason:string;note:string;from_status:string;actor_id:string}[]>('select queue_edit_history($1) as v',[first.id]);
      assert.equal(history.length,1);assert.equal(history[0].reason,'staff-error');assert.equal(history[0].note,'Salah klik panggilan');
      assert.equal(history[0].from_status,'called');assert.equal(history[0].actor_id,staff);
    });
    await t.test('lost-response retries are idempotent and changed payloads/stale clicks are rejected',async()=>{
      assert.equal((await restore(snapshot,'staff-error','Salah klik panggilan',request)).edit_count,1);
      await assert.rejects(restore(snapshot,'staff-error','Different note',request),/Identitas permintaan/);
      await assert.rejects(restore(snapshot),/Status tiket sudah berubah/);
      await assert.rejects(restore(first),/Data pemulihan/);
    });
    await t.test('old queued pushes are cancelled and a late acknowledgement cannot change the restored ticket',async()=>{
      await db.exec('reset role');
      const jobs=await db.query<{state:string;attempts:number;cancelled_at:string|null;lease_token:string|null}>('select state,attempts,cancelled_at,lease_token from qms_private.push_jobs where ticket_id=$1',[first.id]);
      assert.equal(jobs.rows[0].state,'failed');assert.equal(jobs.rows[0].attempts,3);assert.ok(jobs.rows[0].cancelled_at);assert.equal(jobs.rows[0].lease_token,null);
      await actor(staff);
      await db.query("select staff_finish_call_push($1,$2,'accepted',201)",[leased[0].id,leased[0].lease_token]);
      assert.equal((await row(first.id)).push_status,null);
    });
    await t.test('a fresh call gets a new anchor, one new job and a full new 15-minute window',async()=>{
      await db.exec('reset role');await db.exec('update qms_private.scheduler_config set enabled=true');await actor(staff);
      first=await transition(first.id,'called');assert.equal(first.call_count,1);assert.notEqual(String(first.called_at),String(snapshot.called_at));
      assert.equal(first.edit_count,1);
      const jobs=await value<{id:string}[]>('select claim_push_jobs($1) as v',[first.id]);assert.equal(jobs.length,1);assert.notEqual(jobs[0].id,leased[0].id);
      await db.exec('reset role');await db.exec('select qms_private.advance_queue_calls()');await actor(staff);
      assert.equal((await row(first.id)).status,'called');assert.equal((await row(first.id)).call_count,1);
      await assert.rejects(restore(snapshot),/Status tiket sudah berubah/);
      first=await transition(first.id,'seated');first=await restore(first,'staff-error','Meja belum diberikan');assert.equal(first.edit_count,2);assert.equal(first.status,'waiting');
    });
    await t.test('late arrivals can restore skipped tickets while other tickets and subscriptions remain unchanged',async()=>{
      let missed=await create();missed=await transition(missed.id,'no-show');
      const otherTicket=await create();const recovered=await restore(missed,'late-arrival','Tamu kembali ke kasir');
      assert.equal(recovered.status,'waiting');assert.equal(recovered.id,missed.id);assert.equal(recovered.queue_number,missed.queue_number);
      assert.equal((await row(otherTicket.id)).status,'waiting');
      await db.exec('reset role');assert.equal(await value<number>('select count(*)::int as v from qms_private.push_subscriptions where ticket_id=$1',[first.id]),1);await actor(staff);
    });
    await t.test('validation rejects previous-day tickets, unsuitable reasons and long notes',async()=>{
      let old=await create();old=await transition(old.id,'no-show');
      await db.exec('reset role');await db.query("update queue_entries set service_date=service_date-1 where id=$1",[old.id]);await actor(staff);
      await assert.rejects(restore(old,'late-arrival'),/hari pendaftaran/);
      let called=await create();called=await transition(called.id,'called');
      await assert.rejects(restore(called,'late-arrival'),/hanya berlaku/);
      await assert.rejects(restore(called,'unknown'),/Data pemulihan/);
      await assert.rejects(restore(called,'staff-error','x'.repeat(201)),/Data pemulihan/);
    });
    await t.test('recovering an old guest ticket cannot create a second active ticket for that guest',async()=>{
      await actor(guest);
      const registered=await value<{id:string}>('select register_customer($1,2,$2,null) as v',['Guest fixture',crypto.randomUUID()]);
      await actor(staff);const missed=await transition(registered.id,'no-show');
      await actor(guest);await db.query("select register_customer('Guest fixture',2,$1,null)",[crypto.randomUUID()]);
      await actor(staff);await assert.rejects(restore(missed,'late-arrival'),/sudah memiliki antrean aktif/);
    });
    await t.test('audit notes and staff identity never enter public board or private customer-ticket responses',async()=>{
      const customer=await value<Record<string,unknown>>('select customer_ticket($1) as v',[token]);
      const board=await value<Record<string,unknown>>('select to_jsonb(q) as v from queue_board q where id=$1',[first.id]);
      for(const data of [customer,board])for(const field of ['edit_count','last_edited_at','note','actor_id','reason'])assert.equal(field in data,false);
      await actor(guest);await assert.rejects(db.query('select queue_edit_history($1)',[first.id]),/Akses staf/);
    });
  } finally {await db.close();}
});
