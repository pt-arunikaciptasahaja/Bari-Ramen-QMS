-- Apply AFTER reliable_call_schedule, while scheduler_config.enabled=false.
-- This installs the dormant infrastructure; activation is a separate release step.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create or replace function qms_private.run_queue_scheduler() returns void
language plpgsql security definer set search_path='' as $$
declare cfg qms_private.scheduler_config; secret text;
begin
  select * into cfg from qms_private.scheduler_config where singleton;
  if not cfg.enabled then return; end if;
  -- Do not overlap even if an operator also invokes this function.
  if not pg_try_advisory_xact_lock(hashtextextended('qms_server_scheduler',0)) then return; end if;
  perform qms_private.advance_queue_calls();
  if cfg.worker_url is null then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='qms_worker_secret';
  if secret is null then raise exception 'QMS worker secret is missing'; end if;
  if exists(select 1 from qms_private.push_jobs j join public.queue_entries q on q.id=j.ticket_id
    where q.status='called' and q.last_call_at=j.called_at and j.attempts<3
      and (j.state='pending' or (j.state in ('sending','failed') and j.leased_at<clock_timestamp()-interval '60 seconds')))
  then
    perform net.http_post(url:=cfg.worker_url,
      headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),
      body:='{}'::jsonb,timeout_milliseconds:=25000);
  end if;
end;
$$;
revoke all on function qms_private.run_queue_scheduler() from public,anon,authenticated;
select cron.schedule('qms-server-calls','10 seconds','select qms_private.run_queue_scheduler()');
