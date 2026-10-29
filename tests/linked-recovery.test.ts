import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const folder=new URL('../supabase/migrations/',import.meta.url);
const migration='20261029042320_queue_recovery_and_scheduler_safety.sql';
async function setup(upgraded=true){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
  grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`);
 for(const f of(await readdir(folder)).filter(f=>f.endsWith('.sql')&&(upgraded||f!==migration)).sort())await db.exec(await readFile(new URL(f,folder),'utf8'));
 const staff=crypto.randomUUID(),safari=crypto.randomUUID(),app=crypto.randomUUID(),third=crypto.randomUUID();
 await db.query('insert into auth.users values($1),($2),($3),($4)',[staff,safari,app,third]);await db.query('insert into staff_members values($1)',[staff]);
 const value=async<T>(sql:string,args:unknown[]=[]) => (await db.query<{v:T}>(sql,args)).rows[0].v;
 async function actor(id:string,role='authenticated'){await db.exec(`reset role;set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
 type Ticket={id:string;token:string;visit_token:string};
 const register=(seed:string|null=null)=>value<Ticket>("select register_linked_customer('Linked recovery fixture',7,$1,null,$2) v",[crypto.randomUUID(),seed]);
 const transition=(id:string,status:string)=>db.query('select transition_queue($1,$2)',[id,status]);
 const restore=(id:string,status='no-show',edits=0,request=crypto.randomUUID())=>value<{id:string;status:string;edit_count:number}>('select to_jsonb(restore_queue($1,$2,$3,$4,$5,$6)) v',[id,status,edits,status==='no-show'?'late-arrival':'staff-error','verified fixture',request]);
 const resolve=(token:string)=>value<{token:string}|null>('select resolve_customer_visit($1) v',[token]);
 return {db,staff,safari,app,third,value,actor,register,transition,restore,resolve};
}

test('linked-party recovery preserves every visit across sessions, retries and capability rotation',async t=>{
 const {db,staff,safari,app,third,value,actor,register,transition,restore,resolve}=await setup();
 try{
  await actor(safari);const first=await register();
  await actor(staff);await transition(first.id,'no-show');
  await actor(app);const second=await register(first.visit_token);
  await actor(staff);await transition(second.id,'called');await transition(second.id,'seated');
  await actor(third);const current=await register(first.visit_token);
  await actor(staff);
  await t.test('both original and intermediate visits reject restore while a different-session ticket is active',async()=>{
   await assert.rejects(restore(first.id),/sudah memiliki antrean aktif/);
   await assert.rejects(restore(second.id,'seated'),/sudah memiliki antrean aktif/);
   await db.exec('reset role');
   assert.equal(await value<number>("select count(*)::int v from queue_entries where status in('waiting','called')"),1);
   assert.equal(await value<number>('select count(*)::int v from qms_private.queue_edits'),0);
   assert.equal(await value<number>('select count(*)::int v from qms_private.customer_visit_members'),3);
   await actor(staff);
  });
  await transition(current.id,'no-show');
  const restoreRequest=crypto.randomUUID();
  await t.test('an intermediate visit can be restored once the party has no active ticket and links follow it',async()=>{
   const restored=await restore(second.id,'seated',0,restoreRequest);
   assert.equal(restored.status,'waiting');assert.equal(restored.edit_count,1);
   assert.equal((await resolve(first.visit_token))!.token,second.token);
   assert.equal((await resolve(first.visit_token))!.token,second.token);
  });
  await t.test('registering after recovery reuses the restored ticket without consuming another number',async()=>{
   await actor(safari);assert.equal((await register(first.visit_token)).id,second.id);
   await db.exec('reset role');assert.equal(await value<number>('select count(*)::int v from queue_entries'),3);
   await actor(staff);
  });
  await transition(second.id,'no-show');await actor(safari);const fourth=await register(first.visit_token);await actor(staff);
  await t.test('a lost-response restore retry never repoints a later active visit',async()=>{
   const replay=await restore(second.id,'seated',0,restoreRequest);assert.equal(replay.status,'no-show');
   assert.equal((await resolve(first.visit_token))!.token,fourth.token);
   await assert.rejects(restore(second.id,'no-show',1),/sudah memiliki antrean aktif/);
  });
  await t.test('ordinary cancellation still resets call cycle and records a Diedit marker',async()=>{
   await transition(fourth.id,'called');const cancelled=await restore(fourth.id,'called');
   assert.equal(cancelled.edit_count,1);assert.equal(cancelled.status,'waiting');
   const state=await value<{call_count:number;called_at:null}>('select jsonb_build_object(\'call_count\',call_count,\'called_at\',called_at) v from queue_entries where id=$1',[fourth.id]);
   assert.equal(state.call_count,0);assert.equal(state.called_at,null);
  });
  await transition(fourth.id,'no-show');await actor(app);const fifth=await register(first.visit_token);
  await db.exec('reset role');await db.exec("update qms_private.customer_visit_links set expires_at=now()-interval '1 second'");
  await actor(app);
  await t.test('rotating an expired bridge does not revive its expired seed or intermediate capabilities',async()=>{
   assert.equal(await value<string>('select link_customer_visit($1) v',[fifth.token]),fifth.token);
   for(const old of[first.token,second.token,current.token,fourth.token])assert.equal(await resolve(old),null);
   assert.equal((await resolve(fifth.token))!.token,fifth.token);
   await actor(staff);await assert.rejects(restore(first.id),/sudah memiliki antrean aktif/);
  });
  await t.test('membership and original registration helper remain inaccessible to public/guest callers',async()=>{
   await actor(app);await assert.rejects(db.query('select * from qms_private.customer_visit_members'),/permission denied/);
   await assert.rejects(db.query("select qms_private.register_customer('x',2,$1,null)",[crypto.randomUUID()]),/permission denied/);
   const ticket=await value<Record<string,unknown>>('select customer_ticket($1,false) v',[fifth.token]);
   for(const key of['party_id','owner_id','token_hash','access_expires_at'])assert.equal(key in ticket,false);
   await actor('','anon');await assert.rejects(register(),/permission denied/);
  });
 }finally{await db.close();}
});

test('upgrade preserves live ticket state, backfills proven endpoints and fails closed on unknown older visits',async()=>{
 const {db,staff,safari,app,third,value,actor,register,transition,restore,resolve}=await setup(false);
 try{
  await actor(safari);const first=await register();await actor(staff);await transition(first.id,'no-show');
  await actor(app);const middle=await register(first.visit_token);await actor(staff);await transition(middle.id,'no-show');
  await actor(third);const latest=await register(first.visit_token);await db.exec('reset role');
  const before=await value('select jsonb_agg(to_jsonb(q) order by id) v from queue_entries q');
  await db.exec(await readFile(new URL(migration,folder),'utf8'));
  assert.deepEqual(await value('select jsonb_agg(to_jsonb(q) order by id) v from queue_entries q'),before);
  assert.equal(await value<number>('select count(*)::int v from qms_private.customer_visit_members'),2);
  await actor(staff);await assert.rejects(restore(middle.id),/Riwayat tautan tiket lama belum lengkap/);
  await assert.rejects(restore(first.id),/sudah memiliki antrean aktif/);
  await transition(latest.id,'no-show');await restore(first.id);
  assert.equal((await resolve(first.visit_token))!.token,first.token);
  await transition(first.id,'no-show');await assert.rejects(restore(middle.id),/Riwayat tautan tiket lama belum lengkap/);
 }finally{await db.close();}
});

test('migration refuses ambiguous pre-existing bridge identity atomically',async()=>{
 const {db,staff,safari,app,register,actor,transition}=await setup(false);
 try{
  await actor(safari);const first=await register();await actor(staff);await transition(first.id,'no-show');
  await actor(app);const second=await register(first.visit_token);await db.exec('reset role');
  await db.query("insert into qms_private.customer_visit_links(token_hash,seed_ticket_id,ticket_id) values(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,$3)",[second.token,second.id,first.id]);
  await assert.rejects(db.exec(await readFile(new URL(migration,folder),'utf8')),/Conflicting visit identities/);
  await db.exec('rollback');
  const rows=await db.query<{v:string|null}>("select to_regclass('qms_private.customer_visit_members')::text v");assert.equal(rows.rows[0].v,null);
 }finally{await db.close();}
});
