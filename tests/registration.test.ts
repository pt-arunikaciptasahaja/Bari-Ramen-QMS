import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validTicketToken } from '../src/lib/tickets';

test('self-registration shares the queue while preserving staff, pickup and private ticket access', async t => {
  const db = new PGlite();
  const staff = '10000000-0000-4000-8000-000000000001';
  const guest = '10000000-0000-4000-8000-000000000002';
  const other = '10000000-0000-4000-8000-000000000003';
  type Registration = { id: string; token: string };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create publication supabase_realtime;`);
    const folder = new URL('../supabase/migrations/', import.meta.url);
    for (const filename of (await readdir(folder)).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(filename, folder), 'utf8'));
    }
    await db.query('insert into auth.users values($1),($2),($3)', [staff, guest, other]);
    await db.query('insert into staff_members values($1)', [staff]);
    async function asUser(id: string, role = 'authenticated') {
      await db.exec(`reset role; set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    }
    async function value<T>(sql: string, args: unknown[] = []) {
      return (await db.query<{ value: T }>(sql, args)).rows[0].value;
    }
    const request = crypto.randomUUID();
    async function register(id = request, name = 'Customer', pax = 3, phone: string | null = '0812-3456-7890') {
      return value<Registration>('select register_customer($1,$2,$3,$4) as value', [name, pax, id, phone]);
    }
    await asUser('', 'anon');
    await t.test('requires an authenticated session, not just the public API key', async () => {
      await assert.rejects(register(), /permission denied/);
      await asUser('');
      await assert.rejects(register(), /Sesi tamu/);
    });
    await asUser(staff);
    const manual = await value<{ id: string; queue_number: string }>(
      "select to_jsonb(enqueue('Manual guest',3,'walk-in',$1,null)) as value", [crypto.randomUUID()]);
    const screen = await value<{ token: string }>('select create_pickup_screen() as value');
    await asUser(guest);
    const own = await register();
    await t.test('returns only an owned private ticket and shares numbering with manual registrations', async () => {
      assert.equal(validTicketToken(own.token), true);
      assert.deepEqual(Object.keys(own).sort(), ['id', 'token']);
      const ticket = await value<Record<string, unknown>>('select customer_ticket($1,false) as value', [own.token]);
      assert.equal(manual.queue_number, 'B-001');
      assert.equal(ticket.queue_number, 'B-002');
      assert.equal(ticket.status, 'waiting');
      assert.equal(ticket.pax, 3);
      assert.equal('customer_name' in ticket, false);
      assert.equal('customer_phone' in ticket, false);
      const rows = await db.query<{ id: string; customer_phone: string }>('select id,customer_phone from queue_entries');
      assert.deepEqual(rows.rows, [{ id: own.id, customer_phone: '+6281234567890' }]);
    });
    await t.test('retries and new requests reuse the active ticket without changing its details', async () => {
      assert.deepEqual(await register(), own);
      assert.deepEqual(await register(crypto.randomUUID(), 'Different', 12, null), own);
      const row = await value<{ name: string; pax: number }>("select jsonb_build_object('name',customer_name,'pax',pax) as value from queue_entries where id=$1", [own.id]);
      assert.deepEqual(row, { name: 'Customer', pax: 3 });
    });
    await t.test('self-registered tickets do not interrupt the manual pickup display', async () => {
      const pickup = await value<{ id: string; kind: string; pending: number }>('select pickup_next($1) as value', [screen.token]);
      assert.equal(pickup.kind, 'ticket');
      assert.equal(pickup.id, manual.id);
      assert.equal(pickup.pending, 1);
    });
    await t.test('guest validation and staff authorization remain enforced', async () => {
      for (const pax of [0, 13, null]) {
        await assert.rejects(value('select register_customer($1,$2,$3,null) as value', ['Name', pax, crypto.randomUUID()]), /Jumlah Orang/);
      }
      await assert.rejects(register(crypto.randomUUID(), '   '), /Nama Tamu/);
      await assert.rejects(register(crypto.randomUUID(), 'Name', 2, 'abc'), /Nomor telepon/);
      await assert.rejects(value("select register_customer('Name',2,null,null) as value"), /Identitas permintaan/);
      await assert.rejects(value("select enqueue('Fake',2,'walk-in',$1,null) as value", [crypto.randomUUID()]), /Akses staf/);
      await assert.rejects(value("select transition_queue($1,'called') as value", [own.id]), /Akses staf/);
      await assert.rejects(value('select staff_ticket_token($1) as value', [manual.id]), /Akses staf/);
      await assert.rejects(db.exec('select * from qms_private.ticket_access'), /permission denied/);
    });
    await asUser(other);
    await t.test('another session cannot reuse request IDs or read private customer details', async () => {
      await assert.rejects(register(), /Identitas permintaan/);
      assert.equal((await db.query('select * from queue_entries where id=$1', [own.id])).rows.length, 0);
      const another = await register(crypto.randomUUID(), 'Other', 2, null);
      assert.notEqual(another.id, own.id);
      const board = await db.query<Record<string, unknown>>('select * from queue_board');
      assert.equal('customer_phone' in board.rows[0], false);
      assert.equal('customer_name' in board.rows[0], false);
    });
    await asUser(staff);
    await value("select transition_queue($1,'called') as value", [own.id]);
    await asUser(guest);
    await t.test('called guests recover their ticket and cannot reserve an extra active place', async () => {
      assert.deepEqual(await register(crypto.randomUUID()), own);
      assert.equal((await value<{ status: string }>('select customer_ticket($1,false) as value', [own.token])).status, 'called');
    });
    await asUser(staff);
    await value("select transition_queue($1,'seated') as value", [own.id]);
    await asUser(guest);
    await t.test('resolved tickets retain idempotency while a new request can join again', async () => {
      assert.deepEqual(await register(), own);
      const next = await register(crypto.randomUUID(), 'Return visit', 3, null);
      assert.notEqual(next.id, own.id);
      const ticket = await value<{ queue_number: string }>('select customer_ticket($1,false) as value', [next.token]);
      assert.equal(ticket.queue_number, 'B-003');
    });
    await db.exec('reset role');
    await db.query("update queue_entries set service_date=service_date-1 where id=$1", [own.id]);
    await asUser(guest);
    await t.test('previous-day requests cannot recover an expired ticket through registration', async () => {
      await assert.rejects(register(), /Identitas permintaan/);
      assert.equal(await value('select customer_ticket($1,false) as value', [own.token]), null);
    });
  } finally { await db.close(); }
});
