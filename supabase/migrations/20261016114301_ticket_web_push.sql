begin;
alter table public.queue_entries add column push_status text check(push_status in ('pending','accepted','failed'));
create table qms_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.queue_entries(id) on delete cascade,
  endpoint text not null unique,
  endpoint_hash text not null unique,
  p256dh text not null,
  auth_key text not null,
  consent_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  last_test_at timestamptz
);
create index push_subscriptions_ticket on qms_private.push_subscriptions(ticket_id);
create table qms_private.push_jobs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.queue_entries(id) on delete cascade,
  subscription_id uuid not null references qms_private.push_subscriptions(id) on delete cascade,
  called_at timestamptz not null,
  state text not null default 'pending' check(state in ('pending','sending','accepted','failed','dead')),
  attempts integer not null default 0,
  leased_at timestamptz,
  provider_status integer,
  unique(subscription_id,called_at)
);
create index push_jobs_ticket on qms_private.push_jobs(ticket_id,state);
alter table qms_private.push_subscriptions enable row level security;
alter table qms_private.push_jobs enable row level security;
revoke all on qms_private.push_subscriptions,qms_private.push_jobs from public,anon,authenticated;

create function public.save_push_subscription(p_token text,p_endpoint text,p_key text,p_auth text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries; existing uuid;
begin
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where a.token=p_token and q.service_date=(now() at time zone 'Asia/Jakarta')::date and q.status in ('waiting','called');
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
end;
$$;

create function public.ticket_push_status(p_token text,p_endpoint_hash text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from qms_private.push_subscriptions s join qms_private.ticket_access a on a.ticket_id=s.ticket_id
    join public.queue_entries q on q.id=s.ticket_id where a.token=p_token and s.endpoint_hash=p_endpoint_hash
      and s.expires_at>now() and q.status in ('waiting','called'));
$$;
create function public.remove_push_subscription(p_token text,p_endpoint_hash text) returns void
language sql security definer set search_path='' as $$
  delete from qms_private.push_subscriptions s using qms_private.ticket_access a
    where a.ticket_id=s.ticket_id and a.token=p_token and s.endpoint_hash=p_endpoint_hash;
$$;

create function qms_private.queue_call_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='called' and new.called_at is distinct from old.called_at then
    insert into qms_private.push_jobs(ticket_id,subscription_id,called_at)
      select new.id,id,new.called_at from qms_private.push_subscriptions where ticket_id=new.id and expires_at>now()
      on conflict(subscription_id,called_at) do nothing;
    if found then update public.queue_entries set push_status='pending' where id=new.id; end if;
  end if;
  return new;
end;
$$;
revoke all on function qms_private.queue_call_push() from public,anon,authenticated;
create trigger queue_call_push after update on public.queue_entries for each row execute function qms_private.queue_call_push();

create function public.claim_push_jobs(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  with chosen as (
    select j.id from qms_private.push_jobs j join public.queue_entries q on q.id=j.ticket_id
      join qms_private.push_subscriptions s on s.id=j.subscription_id
      where j.ticket_id=p_id and s.ticket_id=q.id and q.status='called' and q.called_at=j.called_at
        and q.service_date=(now() at time zone 'Asia/Jakarta')::date and s.expires_at>now()
        and j.attempts<3 and (j.state='pending' or (j.state in ('failed','sending') and j.leased_at<clock_timestamp()-interval '15 seconds'))
      order by j.id limit 3 for update of j skip locked
  ), leased as (
    update qms_private.push_jobs j set state='sending',attempts=attempts+1,leased_at=clock_timestamp()
      from chosen c where c.id=j.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'ticket_id',j.ticket_id,'token',a.token,'queue_number',q.queue_number,
      'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key)))),'[]'::jsonb)
      into answer from leased j join qms_private.push_subscriptions s on s.id=j.subscription_id
      join public.queue_entries q on q.id=j.ticket_id join qms_private.ticket_access a on a.ticket_id=j.ticket_id;
  return answer;
end;
$$;

create function public.finish_push_job(p_job uuid,p_result text,p_provider_status integer) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid; tid uuid;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  if p_result not in ('accepted','failed','dead') then raise exception 'Hasil tidak valid.'; end if;
  select ticket_id into tid from qms_private.push_jobs where id=p_job;
  if tid is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(tid::text,2));
  update qms_private.push_jobs set state=p_result,provider_status=p_provider_status where id=p_job and state='sending' returning subscription_id,ticket_id into sid,tid;
  if tid is not null then
    update public.queue_entries set push_status=case
      when exists(select 1 from qms_private.push_jobs where ticket_id=tid and state in ('pending','sending')) then 'pending'
      when exists(select 1 from qms_private.push_jobs where ticket_id=tid and state='accepted') then 'accepted'
      else 'failed' end where id=tid;
  end if;
  if p_result='dead' and p_provider_status in (404,410) then delete from qms_private.push_subscriptions where id=sid; end if;
end;
$$;

create function public.push_test_target(p_token text,p_endpoint_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s qms_private.push_subscriptions; r public.queue_entries;
begin
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where a.token=p_token and q.service_date=(now() at time zone 'Asia/Jakarta')::date and q.status in ('waiting','called');
  if not found then raise exception 'Tiket tidak aktif.'; end if;
  update qms_private.push_subscriptions set last_test_at=clock_timestamp()
    where ticket_id=r.id and endpoint_hash=p_endpoint_hash and expires_at>now()
      and (last_test_at is null or last_test_at<clock_timestamp()-interval '30 seconds') returning * into s;
  if not found then raise exception 'Tunggu sebelum mencoba lagi.'; end if;
  return jsonb_build_object('id',s.id,'ticket_id',r.id,'token',p_token,'queue_number',r.queue_number,
    'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key)));
end;
$$;

revoke all on function public.save_push_subscription(text,text,text,text),public.ticket_push_status(text,text),public.remove_push_subscription(text,text),public.push_test_target(text,text),public.claim_push_jobs(uuid),public.finish_push_job(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.save_push_subscription(text,text,text,text),public.ticket_push_status(text,text),public.remove_push_subscription(text,text),public.push_test_target(text,text) to anon,authenticated;
grant execute on function public.claim_push_jobs(uuid),public.finish_push_job(uuid,text,integer) to authenticated;
commit;
