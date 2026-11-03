begin;
-- Existing call cycles retain their original deadline. No queue rows are rewritten.
alter table qms_private.scheduler_config add column call_policy_started_at timestamptz not null default clock_timestamp();
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
    and v_entry.called_at<=clock_timestamp()-(case when v_entry.called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '10 minutes' else interval '15 minutes' end)
    and exists(select 1 from qms_private.scheduler_config where enabled) then
    raise exception 'Batas kedatangan sudah berakhir. Periksa antrean terbaru.';
  end if;
  update public.queue_entries set status = p_status,
    called_at = case when p_status = 'called' then clock_timestamp() else called_at end
    where id = p_id returning * into v_entry;
  return v_entry;
end;
$$;


create or replace function qms_private.advance_queue_calls() returns integer
language plpgsql security definer set search_path='' as $$
declare r record; target integer; changed integer:=0; tick timestamptz:=clock_timestamp();
begin
  if not exists(select 1 from qms_private.scheduler_config where enabled) then return 0; end if;
  for r in select id,called_at,call_count from public.queue_entries
    where status='called' and call_count>0 and called_at<=tick-(case when called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '3 minutes' else interval '5 minutes' end)
      and (call_count<3 or called_at<=tick-(case when called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '10 minutes' else interval '15 minutes' end))
    order by called_at limit 200 for update skip locked
  loop
    if r.called_at<=tick-(case when r.called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '10 minutes' else interval '15 minutes' end) then
      update public.queue_entries set status='no-show' where id=r.id and status='called';
      changed:=changed+1;
    else
      target:=case when r.called_at<=tick-(case when r.called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '6 minutes' else interval '10 minutes' end) then 3 else 2 end;
      if target>r.call_count then
        update public.queue_entries set call_count=target,
          last_call_at=called_at+((target-1)*(case when called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '3 minutes' else interval '5 minutes' end)) where id=r.id and status='called';
        changed:=changed+1;
      end if;
    end if;
  end loop;
  return changed;
end;
$$;
revoke all on function qms_private.advance_queue_calls() from public,anon,authenticated;


create or replace function qms_private.claim_call_push_jobs(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
  with chosen as (
    select j.id from qms_private.push_jobs j join public.queue_entries q on q.id=j.ticket_id
      join qms_private.push_subscriptions s on s.id=j.subscription_id
      where (p_id is null or j.ticket_id=p_id) and s.ticket_id=q.id and q.status='called'
        and coalesce(q.last_call_at,q.called_at)=j.called_at
        and q.called_at>clock_timestamp()-(case when q.called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '10 minutes' else interval '15 minutes' end)
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

commit;
