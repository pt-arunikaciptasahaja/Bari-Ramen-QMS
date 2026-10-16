import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validTicketToken,ticketUrl} from '../src/lib/tickets';

test('ticket URL keeps its random capability out of the HTTP path',()=>{
  const token='a'.repeat(64), url=new URL(ticketUrl('https://example.com',token));
  assert.equal(url.pathname,'/ticket'); assert.equal(url.search,''); assert.equal(url.hash,`#t=${token}`);
  for(const value of ['', '23', 'a'.repeat(63), 'z'.repeat(64)]) assert.equal(validTicketToken(value),false);
});

test('customer handoff: FIFO, scoped screens, idempotent scan, skips, expiry and data privacy',async(t)=>{
  const db=new PGlite();
  const staff='10000000-0000-4000-8000-000000000001',guest='10000000-0000-4000-8000-000000000002';
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
      create publication supabase_realtime;`);
    const folder=new URL('../supabase/migrations/',import.meta.url);
    for(const filename of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(filename,folder),'utf8'));
    await db.query('insert into auth.users values($1),($2)',[staff,guest]);
    await db.query('insert into staff_members values($1)',[staff]);
    async function asUser(id:string){await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
    async function anon(){await db.exec('reset role; set role anon');await db.query("select set_config('request.jwt.claim.sub','',false)");}
    async function call<T>(sql:string,args:unknown[]=[]){return (await db.query<{value:T}>(sql,args)).rows[0]?.value;}
    await asUser(staff);
    const one=await call<{id:string;queue_number:string}>("select to_jsonb(enqueue('Private Name',2,'walk-in',$1,'+12025550123')) as value",[crypto.randomUUID()]);
    const two=await call<{id:string}>("select to_jsonb(enqueue('Second',5,'walk-in',$1,null)) as value",[crypto.randomUUID()]);
    const screen=await call<{token:string}>('select create_pickup_screen() as value');
    assert.equal(validTicketToken(screen.token),true);
    const first=await call<Record<string,unknown>>('select pickup_next($1) as value',[screen.token]);
    const token=first.token as string;
    await t.test('staff-created tickets automatically enter FIFO without exposing guest identity',()=>{
      assert.equal(first.id,one.id);assert.equal(first.pending,2);assert.equal(first.kind,'ticket');
      assert.equal('customer_phone' in first,false);assert.equal('customer_name' in first,false);
      assert.equal(validTicketToken(token),true);
    });
    await anon();
    await t.test('unpaired screens cannot see QR tokens; public users cannot set up or skip',async()=>{
      await assert.rejects(call('select pickup_next($1) as value',['0'.repeat(64)]),/Tautan layar/);
      await assert.rejects(call('select create_pickup_screen() as value'),/permission denied/);
      await assert.rejects(call('select staff_ticket_token($1) as value',[one.id]),/permission denied/);
      await assert.rejects(call('select skip_ticket_handoff($1) as value',[one.id]),/permission denied/);
      await assert.rejects(db.exec('select * from qms_private.ticket_access'),/permission denied/);
      await assert.rejects(db.exec('update queue_entries set status=\'seated\''),/permission denied/);
      assert.equal(await call('select customer_ticket($1,true) as value',['0'.repeat(64)]),null);
    });
    await t.test('only exact token opens ticket; reading alone does not advance the display',async()=>{
      const ticket=await call<Record<string,unknown>>('select customer_ticket($1,false) as value',[token]);
      assert.equal(ticket.id,one.id);assert.equal('customer_name' in ticket,false);assert.equal('customer_phone' in ticket,false);
      assert.equal('token' in ticket,false);assert.equal('owner_id' in ticket,false);
      const pending=await call<Record<string,unknown>>('select pickup_next($1) as value',[screen.token]);assert.equal(pending.id,one.id);
      assert.equal(await call('select customer_ticket($1,true) as value',[one.id]),null);
    });
    await call('select customer_ticket($1,true) as value',[token]);
    await t.test('a successful opening shows shared acknowledgement and allows repeat reads',async()=>{
      const ack=await call<Record<string,unknown>>('select pickup_next($1) as value',[screen.token]);
      assert.equal(ack.kind,'opened');assert.equal(ack.queue_number,one.queue_number);assert.equal('token' in ack,false);
      assert.equal((await call<{id:string}>('select customer_ticket($1,true) as value',[token])).id,one.id);
    });
    await db.exec('reset role');
    const opened=(await db.query<{at:string}>('select ticket_opened_at::text as at from queue_entries where id=$1',[one.id])).rows[0].at;
    await anon();await call('select customer_ticket($1,true) as value',[token]);await db.exec('reset role');
    assert.equal((await db.query<{at:string}>('select ticket_opened_at::text as at from queue_entries where id=$1',[one.id])).rows[0].at,opened);
    await db.query("update queue_entries set ticket_opened_at=clock_timestamp()-interval '10 seconds' where id=$1",[one.id]);
    await anon();
    await t.test('next ticket appears after acknowledgement; scan never seats the guest',async()=>{
      const next=await call<Record<string,unknown>>('select pickup_next($1) as value',[screen.token]);assert.equal(next.id,two.id);assert.equal(next.pending,1);
      assert.equal((await call<{status:string}>('select customer_ticket($1,false) as value',[token])).status,'waiting');
    });
    await asUser(guest);
    await t.test('anonymous signed-in guests cannot use staff operations',async()=>{
      await assert.rejects(call('select create_pickup_screen() as value'),/Akses staf/);
      await assert.rejects(call('select staff_ticket_token($1) as value',[one.id]),/Akses staf/);
      await assert.rejects(call('select skip_ticket_handoff($1) as value',[two.id]),/Akses staf/);
    });
    await asUser(staff);await call('select skip_ticket_handoff($1) as value',[two.id]);
    await t.test('skip scan removes QR but keeps the table queue and permits manual QR recovery',async()=>{
      assert.equal((await call<{kind:string}>('select pickup_next($1) as value',[screen.token])).kind,'empty');
      const secondToken=await call<string>('select staff_ticket_token($1) as value',[two.id]);
      assert.equal((await call<{status:string}>('select customer_ticket($1,true) as value',[secondToken])).status,'waiting');
    });
    await db.exec('reset role');
    await db.query("update queue_entries set service_date=service_date-1 where id=$1",[one.id]);
    await db.exec("update qms_private.pickup_screens set expires_at=now()-interval '1 second'");
    await anon();
    await t.test('tickets expire at service-day rollover; paired display expires separately',async()=>{
      assert.equal(await call('select customer_ticket($1,false) as value',[token]),null);
      await assert.rejects(call('select pickup_next($1) as value',[screen.token]),/Tautan layar/);
    });
  }finally{await db.close();}
});
