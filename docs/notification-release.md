# Notification and server scheduler release

Scope: Bari Ramen QMS only. IGNATIA POS remains separate. Production branch is `main`; review branch is `qms-notification-updates`.

## Migration audit and installed state

The live Supabase project is `niveuzuqyfcunjzqmswg`. Before any DDL, its recorded history was inspected and the actual `transition_queue`, `customer_ticket`, board synchronization and push functions were compared with repository SQL. Existing historical version differences were found; do **not** run an unreviewed `supabase db push` or repair history automatically.

| Migration | Repository version | Existing database version |
| --- | --- | --- |
| queue | 001 | 001 |
| restrict_queue_rpc_permissions | 20261015070622 | 20261015070448 |
| walkin_only_customer_phone | 20261016072753 | 20261016073448 |
| update_party_group_boundaries | 20261016080830 | 20261016081045 |
| customer_ticket_handoff | 20261016090128 | 20261016090811 |
| ticket_web_push | 20261016114301 | 20261016115518 |
| customer_self_registration | 20261021174148 | 20261021174148 |

This release adds:

- `20261021182417_reliable_call_schedule`: portable additive schema/functions, installed in production with scheduler disabled. No historical or active queue rows were backfilled or renumbered.
- `20261021182430_install_qms_server_scheduler`: platform SQL in `supabase/platform/`; installs `pg_cron`, `pg_net`, and the `qms-server-calls` job every 10 seconds. This job returns immediately while the private activation flag is false. Platform extensions are tested on Supabase; PGlite exercises the portable database logic.
- A new `QMS_WORKER_SECRET` was generated, saved as a Production-only sensitive Vercel variable and in Supabase Vault. Its SHA-256 digest and the fixed production worker URL are stored privately. No existing production secrets were read or copied to preview.

Safety checks immediately before installation: 3 waiting, 0 called, 29 seated, 9 no-show. Scheduling stays disabled until release activation. Neither installation calls the transition processor on active tickets nor sends customer messages.

## How it works

The first staff call writes `call_count=1`, `called_at` and `last_call_at` atomically. `called_at` remains the first call anchor. Supabase Cron checks due calls every 10 seconds, locks rows with `FOR UPDATE SKIP LOCKED`, advances to 2 at five minutes and 3 at ten minutes, then sets unresolved calls to `no-show` at fifteen minutes. Seating after the deadline is rejected while automatic processing is enabled. Seating before the deadline stops future reminders. Waiting tickets are never advanced automatically.

Board and private ticket responses contain the committed count; browsers do not invent calls from elapsed time. TV audio follows committed count changes. No browser has to remain open for scheduling or push dispatch. After an outage the current reminder replaces obsolete reminders; expired calls become no-show without replaying a backlog. Legacy called tickets with `call_count=0` are not adopted silently; cut over with no unresolved called tickets.

Push jobs are unique by subscription and call timestamp. Claims lock/lease jobs, allow at most three attempts, and current staff/worker acknowledgements carry a random lease token. Stale acknowledgements cannot complete newer attempts. Dead subscriptions are removed only after provider 404/410. First calls can be sent immediately by the staff route, and the server worker recovers pending/abandoned jobs. A successful provider response is acceptance, not proof of delivery or sound. A timeout can still cause uncertain delivery; matching per-call notification tags/topics reduce duplicate visible notifications. Exactly-once network delivery is not promised.

WhatsApp unlocks only when count 3 is committed and ten minutes have elapsed, with a valid customer phone and `called` status on the current Jakarta service date. It remains available until seating/no-show. The destination is the customer; the sender is the WhatsApp account signed in on the staff device. Staff should use **+62 852-1996-9592**. A click-to-chat URL cannot force switching sender accounts and never sends the message automatically.

## Release order

1. Review the PR and exact tested commit; verify regression, TypeScript and production build results.
2. Review preview in demo mode. Preview has no production database, VAPID private key or worker secret. Do not copy production credentials into Preview.
3. Merge only after release approval. Let Vercel build `main` using Production variables, then verify the exact deployed commit is READY. Do not promote a demo-mode preview build as the production artifact.
4. Check production `/staff`, `/register`, `/pickup`, `/ticket`, `/tv` and unauthenticated `/api/queue/worker` (must be 401).
5. Confirm there are no unresolved `called` tickets and verify VAPID and worker configuration. Use a separate test project/devices for push transport acceptance before enabling automation on live guests.
6. Activate in the SQL editor or an authorized deployment operation, in a short transaction which serializes with new calls:

```sql
begin;
lock table public.queue_entries in share row exclusive mode;
do $$
begin
  if exists(select 1 from public.queue_entries where status='called') then
    raise exception 'Resolve called tickets before activating automatic calls.';
  end if;
  if not exists(select 1 from vault.secrets where name='qms_worker_secret') then
    raise exception 'Worker secret is missing.';
  end if;
  update qms_private.scheduler_config set enabled=true
    where singleton and worker_secret_hash is not null and worker_url is not null;
  if not found then raise exception 'Worker configuration is incomplete.'; end if;
end;
$$;
commit;
```

7. Inspect `cron.job_run_details` for successful runs and `net._http_response` for worker 2xx. Monitor provider errors without logging ticket tokens or subscription endpoints. Do not export HTTP request headers or Vault contents.

```sql
select jobname,schedule,active from cron.job where jobname='qms-server-calls';
select status,return_message,start_time,end_time from cron.job_run_details
where jobid=(select jobid from cron.job where jobname='qms-server-calls')
order by runid desc limit 10;
select status_code,error_msg,created from net._http_response
order by created desc limit 10;
```

## Rollback

Disable automatic processing first, then roll the application back if necessary:

```sql
update qms_private.scheduler_config set enabled=false where singleton;
```

Keep additive columns, outbox history and existing migrations. Do not drop tables, reset counters, bulk-change ticket states or repair migration history. Already completed/no-show transitions are not undone automatically.

## Validation and remaining acceptance

- Automated PostgreSQL regression covers 0/5/10/15-minute boundaries, unchanged first-call anchor, duplicate ticks/claims, staff seating, overdue seating rejection, late scheduler recovery, legacy isolation, private worker authorization and stale-lease acknowledgement rejection.
- Existing registration, A/B/C numbering, pickup handoff, privacy, history, CSV, encryption/service worker, WhatsApp and TV regressions remain required.
- TypeScript and optimized Next.js production build are required.
- Browser checks must state whether they use demo, fixtures or a real isolated database. Never create fake guests in the live queue to make a screenshot pass.
- Physical-device acceptance remains necessary: iOS/iPadOS 16.4+ Home Screen install, notification permission denied/re-enabled, background push while locked; Android Chrome permission and OS settings, test push, and Focus/battery restrictions. A cloud desktop browser cannot prove physical mobile delivery.
- Supabase advisors flag intentional capability-based SECURITY DEFINER APIs and deny-all private tables. Review each new worker API: secret validation is mandatory, private helper EXECUTE is revoked, and direct table access stays denied. Existing leaked-password-protection warning is outside this change.
