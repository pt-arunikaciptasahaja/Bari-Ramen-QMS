import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL migration, authorization, numbering, retries and transitions", async (t) => {
  const db = new PGlite();
  const staff = "10000000-0000-4000-8000-000000000001";
  const guest = "10000000-0000-4000-8000-000000000002";
  const other = "10000000-0000-4000-8000-000000000003";
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/001_queue.sql", import.meta.url),
        "utf8",
      ),
    );
    // Reproduce Supabase's direct default grants, then apply the hardening.
    await db.exec("grant execute on all functions in schema public to anon, authenticated");
    await db.exec(await readFile(new URL(
      "../supabase/migrations/20261015070622_restrict_queue_rpc_permissions.sql",
      import.meta.url,
    ), "utf8"));
    await t.test("trigger helper cannot be called directly by clients", async () => {
      const result = await db.query<{ allowed: boolean }>(
        "select has_function_privilege('authenticated', 'public.sync_queue_board()', 'execute') as allowed",
      );
      assert.equal(result.rows[0].allowed, false);
    });
    await db.query("insert into auth.users(id) values ($1),($2),($3)", [
      staff,
      guest,
      other,
    ]);
    await db.query("insert into public.staff_members(user_id) values ($1)", [
      staff,
    ]);
    async function asUser(id: string) {
      await db.exec("reset role; set role authenticated;");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    }
    async function enqueue(
      name: string,
      pax: number,
      source = "online",
      request = crypto.randomUUID(),
    ) {
      const result = await db.query<{
        entry: {
          id: string;
          queue_number: string;
          status: string;
          called_at: string | null;
        };
      }>("select to_jsonb(public.enqueue($1,$2,$3,$4)) as entry", [
        name,
        pax,
        source,
        request,
      ]);
      return result.rows[0].entry;
    }
    await asUser(staff);
    const first = await enqueue("Walk-in", 2, "walk-in");
    const second = await enqueue("Walk-in 2", 2, "walk-in");
    const big = await enqueue("Rombongan", 6, "walk-in");
    await t.test("atomic counter gives distinct numbers per category", () => {
      assert.equal(first.queue_number, "A-001");
      assert.equal(second.queue_number, "A-002");
      assert.equal(big.queue_number, "C-001");
    });
    const request = crypto.randomUUID();
    const retry1 = await enqueue("Retry", 3, "walk-in", request);
    const retry2 = await enqueue("Retry", 3, "walk-in", request);
    await t.test("request retry returns same ticket", () =>
      assert.equal(retry1.id, retry2.id),
    );
    await t.test("staff cannot jump waiting straight to seated", async () => {
      await assert.rejects(
        db.query("select public.transition_queue($1,'seated')", [first.id]),
        /Status sudah berubah/,
      );
    });
    await db.query("select public.transition_queue($1,'called')", [first.id]);
    await t.test(
      "call updates public projection, preserves called timestamp",
      async () => {
        const result = await db.query<{
          status: string;
          called_at: string | null;
        }>("select status,called_at from queue_board where id=$1", [first.id]);
        assert.equal(result.rows[0].status, "called");
        assert.ok(result.rows[0].called_at);
        await assert.rejects(
          db.query("select public.transition_queue($1,'called')", [first.id]),
          /Status sudah berubah/,
        );
      },
    );
    await db.query("select public.transition_queue($1,'seated')", [first.id]);
    await asUser(guest);
    const own = await enqueue("Guest", 2);
    const duplicate = await enqueue("Guest again", 2);
    await t.test("guest holds only one active ticket", () =>
      assert.equal(own.id, duplicate.id),
    );
    await t.test("guest cannot create walk-ins or call tickets", async () => {
      await assert.rejects(enqueue("Fake walk-in", 2, "walk-in"), /Hanya staf/);
      await assert.rejects(
        db.query("select public.transition_queue($1,'called')", [own.id]),
        /Akses staf/,
      );
    });
    await t.test("RLS reveals only own private ticket", async () => {
      const result = await db.query<{ id: string }>(
        "select id from queue_entries",
      );
      assert.deepEqual(
        result.rows.map((r) => r.id),
        [own.id],
      );
    });
    await t.test(
      "direct writes and staff allowlist escalation are denied",
      async () => {
        await assert.rejects(
          db.exec("update queue_entries set status='called'"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("insert into staff_members values($1)", [guest]),
          /permission denied/,
        );
        await assert.rejects(
          db.exec("update queue_board set status='called'"),
          /permission denied/,
        );
        await assert.rejects(
          db.exec("select * from queue_counters"),
          /permission denied/,
        );
      },
    );
    await asUser(other);
    await t.test(
      "other guest cannot read ticket or reuse another owner request",
      async () => {
        const result = await db.query(
          "select * from queue_entries where id=$1",
          [own.id],
        );
        assert.equal(result.rows.length, 0);
        await assert.rejects(
          enqueue("Spoof", 2, "online", request),
          /Identitas permintaan tidak valid/,
        );
      },
    );
    await db.exec("reset role; set role anon;");
    await t.test(
      "public board has numbers but no customer names; anon cannot enqueue",
      async () => {
        const result = await db.query<Record<string, unknown>>("select * from queue_board");
        assert.ok(result.rows.length >= 5);
        assert.equal("customer_name" in result.rows[0], false);
        await assert.rejects(
          db.exec("select * from queue_entries"),
          /permission denied/,
        );
        await assert.rejects(enqueue("Anon", 2), /permission denied/);
      },
    );
  } finally {
    await db.close();
  }
});
