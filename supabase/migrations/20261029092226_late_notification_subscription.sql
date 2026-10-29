begin;
-- No backfill: existing tickets and subscriptions remain unchanged until a device opts in.
create or replace function public.save_push_subscription(p_token text,p_endpoint text,p_key text,p_auth text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries; existing uuid;
begin
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where a.token=p_token and q.service_date=(now() at time zone 'Asia/Jakarta')::date and q.status in ('waiting','called') for update of q;
  if not found then raise exception 'Tiket tidak aktif.'; end if;
  if p_endpoint is null or length(p_endpoint)>2048 or p_endpoint !~ '^https://(fcm[.]googleapis[.]com|web[.]push[.]apple[.]com|([a-z0-9-]+[.])*push[.]services[.]mozilla[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]]+$'
    or p_key is null or p_key !~ '^[A-Za-z0-9_-]{87}=?$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}(==)?$'
    then raise exception 'Perangkat tidak valid.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.id::text,1));
  delete from qms_private.push_subscriptions where expires_at<=now();
  select id into existing from qms_private.push_subscriptions where endpoint=p_endpoint;
  if not exists(select 1 from qms_private.push_subscriptions where ticket_id=r.id and endpoint=p_endpoint)
    and (select count(*) from qms_private.push_subscriptions where ticket_id=r.id)>=3 then raise exception 'Batas perangkat tercapai.'; end if;
  insert into qms_private.push_subscriptions(ticket_id,endpoint,endpoint_hash,p256dh,auth_key,expires_at)
    values(r.id,p_endpoint,encode(sha256(convert_to(p_endpoint,'UTF8')),'hex'),p_key,p_auth,((r.service_date+1)::timestamp at time zone 'Asia/Jakarta'))
    on conflict(endpoint) do update set ticket_id=excluded.ticket_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,
      expires_at=excluded.expires_at,consent_at=clock_timestamp();
  -- A late opt-in receives only the current call, never a replay of earlier calls.
  -- Row lock above serializes subscription with staff resolution / scheduler updates.
  if r.status='called' and r.call_count>0 and r.last_call_at is not null
    and r.called_at>clock_timestamp()-(case when r.called_at >=
      (select call_policy_started_at from qms_private.scheduler_config)
      then interval '10 minutes' else interval '15 minutes' end) then
    insert into qms_private.push_jobs(ticket_id,subscription_id,called_at)
      select r.id,id,r.last_call_at from qms_private.push_subscriptions
      where ticket_id=r.id and endpoint=p_endpoint and expires_at>now()
      on conflict(subscription_id,called_at) do nothing;
    if found then update public.queue_entries set push_status='pending' where id=r.id; end if;
  end if;
end;
$$;

commit;
