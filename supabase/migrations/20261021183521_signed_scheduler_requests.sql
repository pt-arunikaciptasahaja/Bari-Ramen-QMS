begin;
create table qms_private.worker_requests (
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null default clock_timestamp()+interval '30 seconds',
  consumed_at timestamptz
);
alter table qms_private.worker_requests enable row level security;
revoke all on qms_private.worker_requests from public,anon,authenticated;
create function public.worker_claim_request(p_secret text,p_receipt uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform qms_private.verify_worker(p_secret);
  update qms_private.worker_requests set consumed_at=clock_timestamp()
    where id=p_receipt and consumed_at is null and expires_at>clock_timestamp();
  if not found then return '[]'::jsonb; end if;
  return qms_private.claim_call_push_jobs(null);
end;
$$;
revoke all on function public.worker_claim_request(text,uuid) from public,anon,authenticated;
grant execute on function public.worker_claim_request(text,uuid) to anon,authenticated;

-- Replaces the initial dormant transport. Do not include the permanent worker
-- secret in pg_net tables: their extension-owned grants may survive REVOKE by
-- the project's postgres role. Only a short-lived one-use signature is visible.
create or replace function qms_private.run_queue_scheduler() returns void
language plpgsql security definer set search_path='' as $$
declare cfg qms_private.scheduler_config; secret text; receipt uuid; stamp text; signature text;
begin
  select * into cfg from qms_private.scheduler_config where singleton;
  if not cfg.enabled then return; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('qms_server_scheduler',0)) then return; end if;
  perform qms_private.advance_queue_calls();
  delete from qms_private.worker_requests where expires_at<clock_timestamp()-interval '5 minutes';
  if cfg.worker_url is null then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='qms_worker_secret';
  if secret is null then raise exception 'QMS worker secret is missing'; end if;
  if exists(select 1 from qms_private.push_jobs j join public.queue_entries q on q.id=j.ticket_id
    where q.status='called' and q.last_call_at=j.called_at and j.attempts<3
      and (j.state='pending' or (j.state in ('sending','failed') and j.leased_at<clock_timestamp()-interval '60 seconds')))
  then
    insert into qms_private.worker_requests default values returning id into receipt;
    stamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
    signature:=encode(extensions.hmac(convert_to(stamp||':'||receipt::text,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex');
    perform net.http_post(url:=cfg.worker_url,
      headers:=jsonb_build_object('x-qms-timestamp',stamp,'x-qms-receipt',receipt::text,'x-qms-signature',signature,'Content-Type','application/json'),
      body:='{}'::jsonb,timeout_milliseconds:=25000);
  end if;
end;
$$;
revoke all on function qms_private.run_queue_scheduler() from public,anon,authenticated;
commit;
