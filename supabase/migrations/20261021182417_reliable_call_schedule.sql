begin;
-- Additive rollout: existing tickets are not rewritten. Automatic processing is off
-- until the production application and server dispatcher have been verified.
alter table public.queue_entries
  add column call_count integer not null default 0 check (call_count between 0 and 3),
  add column last_call_at timestamptz;
alter table public.queue_board
  add column call_count integer not null default 0,
  add column last_call_at timestamptz;
create index queue_calls_due on public.queue_entries(called_at) where status='called' and call_count>0;
alter table qms_private.push_jobs add column lease_token uuid;
create table qms_private.scheduler_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  worker_secret_hash text check(worker_secret_hash ~ '^[a-f0-9]{64}$'),
  worker_url text check(worker_url = 'https://bari-ramen-qms.vercel.app/api/queue/worker')
);
alter table qms_private.scheduler_config enable row level security;
revoke all on qms_private.scheduler_config from public, anon, authenticated;
insert into qms_private.scheduler_config(singleton) values(true);

create function qms_private.begin_call_cycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='called' and old.status='waiting' then
    new.call_count:=1;
    new.last_call_at:=new.called_at;
  end if;
  return new;
end;
$$;
revoke all on function qms_private.begin_call_cycle() from public,anon,authenticated;
create trigger begin_call_cycle before update on public.queue_entries
  for each row execute function qms_private.begin_call_cycle();

create or replace function public.sync_queue_board() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' then delete from public.queue_board where id=old.id; return old; end if;
  insert into public.queue_board(id,queue_number,pax,source,status,created_at,called_at,service_date,group_code,ticket_sequence,call_count,last_call_at)
    values(new.id,new.queue_number,new.pax,new.source,new.status,new.created_at,new.called_at,new.service_date,new.group_code,new.ticket_sequence,new.call_count,new.last_call_at)
    on conflict(id) do update set status=excluded.status,called_at=excluded.called_at,
      call_count=excluded.call_count,last_call_at=excluded.last_call_at;
  return new;
end;
$$;

create or replace function qms_private.queue_call_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='called' and new.call_count>0 and new.call_count is distinct from old.call_count then
    insert into qms_private.push_jobs(ticket_id,subscription_id,called_at)
      select new.id,id,new.last_call_at from qms_private.push_subscriptions where ticket_id=new.id and expires_at>now()
      on conflict(subscription_id,called_at) do nothing;
    if found then update public.queue_entries set push_status='pending' where id=new.id; end if;
  end if;
  return new;
end;
$$;

create or replace function public.customer_ticket(p_token text,p_mark_open boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where a.token=p_token and q.service_date=(now() at time zone 'Asia/Jakarta')::date;
  if not found then return null; end if;
  if p_mark_open and r.ticket_opened_at is null and r.status in ('waiting','called') then
    update public.queue_entries set ticket_opened_at=coalesce(ticket_opened_at,clock_timestamp()) where id=r.id returning * into r;
  end if;
  return jsonb_build_object('id',r.id,'queue_number',r.queue_number,'pax',r.pax,'group_code',r.group_code,
    'status',r.status,'created_at',r.created_at,'called_at',r.called_at,'service_date',r.service_date,
    'ticket_sequence',r.ticket_sequence,'call_count',r.call_count,'last_call_at',r.last_call_at);
end;
$$;

create or replace function public.transition_queue(p_id uuid, p_status text)
returns public.queue_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.queue_entries;
begin
  if not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  select * into v_entry from public.queue_entries where id = p_id for update;
  if not found then raise exception 'Antrean tidak ditemukan.'; end if;
  if v_entry.service_date <> (now() at time zone 'Asia/Jakarta')::date then raise exception 'Antrean sudah berakhir.'; end if;
  if p_status is null or not (
    (v_entry.status = 'waiting' and p_status in ('called','no-show')) or
    (v_entry.status = 'called' and p_status in ('seated','no-show'))
  ) then raise exception 'Status sudah berubah. Periksa antrean terbaru.'; end if;
  if p_status='seated' and v_entry.call_count>0
    and v_entry.called_at<=clock_timestamp()-interval '15 minutes'
    and exists(select 1 from qms_private.scheduler_config where enabled) then
    raise exception 'Batas kedatangan 15 menit sudah berakhir. Periksa antrean terbaru.';
  end if;
  update public.queue_entries set status = p_status,
    called_at = case when p_status = 'called' then clock_timestamp() else called_at end
    where id = p_id returning * into v_entry;
  return v_entry;
end;
$$;

-- Called by pg_cron, not by a browser. Row locks serialize against staff seating
-- and skip concurrent ticks. first called_at NEVER moves to a reminder timestamp.
create function qms_private.advance_queue_calls() returns integer
language plpgsql security definer set search_path='' as $$
declare r record; target integer; changed integer:=0; tick timestamptz:=clock_timestamp();
begin
  if not exists(select 1 from qms_private.scheduler_config where enabled) then return 0; end if;
  for r in select id,called_at,call_count from public.queue_entries
    where status='called' and call_count>0 and called_at<=tick-interval '5 minutes'
      and (call_count<3 or called_at<=tick-interval '15 minutes')
    order by called_at limit 200 for update skip locked
  loop
    if r.called_at<=tick-interval '15 minutes' then
      update public.queue_entries set status='no-show' where id=r.id and status='called';
      changed:=changed+1;
    else
      target:=case when r.called_at<=tick-interval '10 minutes' then 3 else 2 end;
      if target>r.call_count then
        update public.queue_entries set call_count=target,
          last_call_at=called_at+((target-1)*interval '5 minutes') where id=r.id and status='called';
        changed:=changed+1;
      end if;
    end if;
  end loop;
  return changed;
end;
$$;
revoke all on function qms_private.advance_queue_calls() from public,anon,authenticated;

create function qms_private.claim_call_push_jobs(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
  with chosen as (
    select j.id from qms_private.push_jobs j join public.queue_entries q on q.id=j.ticket_id
      join qms_private.push_subscriptions s on s.id=j.subscription_id
      where (p_id is null or j.ticket_id=p_id) and s.ticket_id=q.id and q.status='called'
        and coalesce(q.last_call_at,q.called_at)=j.called_at
        and q.called_at>clock_timestamp()-interval '15 minutes'
        and q.service_date=(now() at time zone 'Asia/Jakarta')::date and s.expires_at>now()
        and j.attempts<3 and (j.state='pending' or (j.state in ('failed','sending') and j.leased_at<clock_timestamp()-interval '60 seconds'))
      order by j.called_at,j.id limit 20 for update of j skip locked
  ), leased as (
    update qms_private.push_jobs j set state='sending',attempts=attempts+1,leased_at=clock_timestamp(),lease_token=gen_random_uuid()
      from chosen c where c.id=j.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'ticket_id',j.ticket_id,'token',a.token,
    'queue_number',q.queue_number,'call_count',q.call_count,'lease_token',j.lease_token,
    'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key)))),'[]'::jsonb)
    into answer from leased j join qms_private.push_subscriptions s on s.id=j.subscription_id
    join public.queue_entries q on q.id=j.ticket_id join qms_private.ticket_access a on a.ticket_id=j.ticket_id;
  return answer;
end;
$$;
revoke all on function qms_private.claim_call_push_jobs(uuid) from public,anon,authenticated;
create or replace function public.claim_push_jobs(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  return qms_private.claim_call_push_jobs(p_id);
end;
$$;

create function qms_private.verify_worker(p_secret text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_secret is null or length(p_secret)<>64 or not exists(
    select 1 from qms_private.scheduler_config where enabled
      and worker_secret_hash=encode(sha256(convert_to(p_secret,'UTF8')),'hex')
  ) then raise exception 'Akses worker ditolak.'; end if;
end;
$$;
revoke all on function qms_private.verify_worker(text) from public,anon,authenticated;
create function public.worker_claim_push(p_secret text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform qms_private.verify_worker(p_secret);
  return qms_private.claim_call_push_jobs(null);
end;
$$;

-- Same finish semantics as the staff route, with an unguessable lease token.
-- A timed-out worker cannot acknowledge a subsequent worker's attempt.
create function qms_private.finish_call_push(p_job uuid,p_lease uuid,p_result text,p_provider_status integer) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid; tid uuid;
begin
  if p_result not in ('accepted','failed','dead') then raise exception 'Hasil tidak valid.'; end if;
  select ticket_id into tid from qms_private.push_jobs where id=p_job;
  if tid is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(tid::text,2));
  update qms_private.push_jobs set state=p_result,provider_status=p_provider_status
    where id=p_job and state='sending' and lease_token=p_lease returning subscription_id,ticket_id into sid,tid;
  if tid is not null then
    update public.queue_entries q set push_status=case
      when exists(select 1 from qms_private.push_jobs j where j.ticket_id=tid and j.called_at=q.last_call_at and j.state in ('pending','sending')) then 'pending'
      when exists(select 1 from qms_private.push_jobs j where j.ticket_id=tid and j.called_at=q.last_call_at and j.state='accepted') then 'accepted'
      else 'failed' end where q.id=tid;
  end if;
  if p_result='dead' and p_provider_status in (404,410) then delete from qms_private.push_subscriptions where id=sid; end if;
end;
$$;
revoke all on function qms_private.finish_call_push(uuid,uuid,text,integer) from public,anon,authenticated;
create function public.worker_finish_push(p_secret text,p_job uuid,p_lease uuid,p_result text,p_provider_status integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform qms_private.verify_worker(p_secret);
  perform qms_private.finish_call_push(p_job,p_lease,p_result,p_provider_status);
end;
$$;
create function public.staff_finish_call_push(p_job uuid,p_lease uuid,p_result text,p_provider_status integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  perform qms_private.finish_call_push(p_job,p_lease,p_result,p_provider_status);
end;
$$;
revoke all on function public.staff_finish_call_push(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.staff_finish_call_push(uuid,uuid,text,integer) to authenticated;
revoke all on function public.worker_claim_push(text),public.worker_finish_push(text,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.worker_claim_push(text),public.worker_finish_push(text,uuid,uuid,text,integer) to anon,authenticated;
commit;
