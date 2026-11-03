import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { importedTicketToken, CUSTOMER_VISIT_KEY } from '../src/lib/customer-visit';
import { CUSTOMER_TICKET_KEY } from '../src/lib/customer-ticket-storage';

test('import accepts only a complete private ticket link on this origin',()=>{
  const origin='https://bari-ramen-qms.vercel.app',token='a'.repeat(64);
  assert.equal(importedTicketToken(` ${origin}/ticket#t=${token} `,origin),token);
  for(const value of ['C-001',token,`https://evil.test/ticket#t=${token}`,`${origin}/staff#t=${token}`,`${origin}/ticket?t=${token}`,`${origin}/ticket#t=short`,`javascript:alert(1)`,`https://name:password@bari-ramen-qms.vercel.app/ticket#t=${token}`])assert.equal(importedTicketToken(value,origin),'');
});

test('separate browser and installed-app sessions share only a deliberately transferred capability',async t=>{
  const db=new PGlite();
  const browser='20000000-0000-4000-8000-000000000001',app='20000000-0000-4000-8000-000000000002',stranger='20000000-0000-4000-8000-000000000003';
  type Ticket={id:string;token:string;visit_token:string};
  const safari=new Map<string,string>(),home=new Map<string,string>();
  async function val<T>(sql:string,args:unknown[]=[]){return (await db.query<{v:T}>(sql,args)).rows[0].v;}
  async function user(id:string,role='authenticated'){await db.exec(`reset role;set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
  async function register(seed:string|null=null,request=crypto.randomUUID()){
    return val<Ticket>('select register_linked_customer($1,7,$2,null,$3) v',['Return guest',request,seed]);
  }
  async function resolve(seed:string){return val<{token:string}|null>('select resolve_customer_visit($1) v',[seed]);}
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
      grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create publication supabase_realtime;`);
    const folder=new URL('../supabase/migrations/',import.meta.url);
    for(const f of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(f,folder),'utf8'));
    await db.query('insert into auth.users values($1),($2),($3)',[browser,app,stranger]);
    await user(browser);
    const request=crypto.randomUUID(),first=await register(null,request);
    safari.set(CUSTOMER_VISIT_KEY,first.visit_token);safari.set(CUSTOMER_TICKET_KEY,first.token);
    await t.test('browser-first registration cannot appear in an unlinked installed app',()=>{
      assert.equal(home.get(CUSTOMER_VISIT_KEY),undefined);
      assert.equal(home.get(CUSTOMER_TICKET_KEY),undefined);
    });
    await t.test('Android Chrome same-profile Home Screen launch reuses the browser ticket without a transfer',async()=>{
      // Same browser profile has the same Auth user even if local ticket state was lost.
      const resumed=await register();
      assert.equal(resumed.id,first.id);
      assert.equal(resumed.visit_token,first.visit_token);
      assert.equal(await val<number>('select count(*)::int v from public.queue_board'),1);
    });
    await user(app);
    await t.test('one explicit transfer opens the same ticket without another registration',async()=>{
      const link=importedTicketToken(`https://qms.test/ticket#t=${first.visit_token}`,'https://qms.test');
      home.set(CUSTOMER_VISIT_KEY,link);
      const current=await resolve(link);home.set(CUSTOMER_TICKET_KEY,current!.token);
      assert.equal(current!.token,first.token);
      assert.equal(await val<number>('select count(*)::int v from public.queue_board'),1);
    });
    await t.test('registration from a different anonymous session reuses the active linked ticket',async()=>{
      assert.equal((await register(first.visit_token)).id,first.id);
      assert.equal(await val<number>('select count(*)::int v from public.queue_board'),1);
    });
    await user('', 'anon');
    await t.test('reads work without shared Auth cookies; guessed queue IDs and tokens reveal nothing',async()=>{
      assert.equal((await resolve(first.visit_token))!.token,first.token);
      assert.equal(await resolve('C-001'),null);
      assert.equal(await resolve('f'.repeat(64)),null);
      await assert.rejects(register(first.visit_token),/permission denied/);
      await assert.rejects(db.query('select * from qms_private.customer_visit_links'),/permission denied/);
    });
    await db.exec('reset role');
    await db.query("update public.queue_entries set status='no-show' where id=$1",[first.id]);
    await user(browser);
    const second=await register(first.visit_token);
    await t.test('return visit gets C-002 and both independent stores resolve the new visit',async()=>{
      assert.notEqual(second.id,first.id);
      assert.equal(second.visit_token,first.visit_token);
      const a=await resolve(safari.get(CUSTOMER_VISIT_KEY)!),b=await resolve(home.get(CUSTOMER_VISIT_KEY)!);
      assert.equal(a!.token,second.token);assert.equal(b!.token,second.token);
      const ticket=await val<{queue_number:string}>('select customer_ticket($1,false) v',[b!.token]);
      assert.equal(ticket.queue_number,'C-002');
    });
    await t.test('reopening the original pinned URL never rolls back to C-001',async()=>{
      assert.equal(await val<string>('select link_customer_visit($1) v',[first.visit_token]),first.visit_token);
      assert.equal((await resolve(first.visit_token))!.token,second.token);
    });
    await t.test('Android Chrome original shortcut resolves a same-day return and a missing local token recovers the active visit',async()=>{
      assert.equal((await resolve(first.visit_token))!.token,second.token);
      const resumed=await register();
      assert.equal(resumed.id,second.id);
      assert.equal(resumed.visit_token,first.visit_token);
    });
    await t.test('a push or current-ticket link keeps the original shared bridge',async()=>{
      assert.equal(await val<string>('select link_customer_visit($1) v',[second.token]),first.visit_token);
    });
    await user(app);
    await t.test('retries from both sessions preserve one active visit and daily counter',async()=>{
      assert.equal((await register(first.visit_token)).id,second.id);
      assert.equal((await register(first.visit_token)).id,second.id);
      assert.equal(await val<number>('select count(*)::int v from public.queue_board'),2);
    });
    await t.test('a stranger without the private link cannot resolve or attach to the party',async()=>{
      await user(stranger);
      await assert.rejects(register('f'.repeat(64)),/berakhir/);
      assert.equal(await val<string|null>('select link_customer_visit($1) v',['f'.repeat(64)]),null);
    });
    await db.exec('reset role');
    await db.query("update public.queue_entries set status='called',called_at=now() where id=$1",[second.id]);
    await db.query("update public.queue_entries set status='seated' where id=$1",[second.id]);
    await user(app);
    const third=await register(first.visit_token);
    await t.test('installed-app-first return after seating is visible in Safari',async()=>{
      assert.notEqual(third.id,second.id);
      assert.equal((await resolve(safari.get(CUSTOMER_VISIT_KEY)!))!.token,third.token);
      assert.equal((await val<{queue_number:string}>('select customer_ticket($1,false) v',[third.token])).queue_number,'C-003');
    });
    await db.exec('reset role');
    await db.query("update public.queue_entries set status='no-show' where id=$1",[third.id]);
    await user(browser);
    await t.test('replaying a finished request cannot reconnect a completed old ticket',async()=>{
      await assert.rejects(register(first.visit_token,request),/Permintaan ini sudah selesai/);
      assert.equal((await resolve(first.visit_token))!.token,third.token);
    });
    await db.exec('reset role');
    await db.exec("update qms_private.customer_visit_links set expires_at=now()-interval '1 second'");
    await user(app);
    await t.test('expired bridge requires reconnection and does not expose future visits',async()=>{
      assert.equal(await resolve(first.visit_token),null);
      await assert.rejects(register(first.visit_token),/berakhir/);
    });
    await t.test('previous-day ticket is not treated as an active current visit',async()=>{
      await db.exec('reset role');
      await db.query("update public.queue_entries set service_date=service_date-1 where id=$1",[third.id]);
      await user(app);
      assert.equal(await val('select customer_ticket($1,false) v',[third.token]),null);
    });
  }finally{await db.close();}
});
