begin;
-- Recovery metadata stays off the anonymous board and customer-ticket RPC.
alter table public.queue_entries
  add column edit_count integer not null default 0 check(edit_count>=0),
  add column last_edited_at timestamptz;
alter table qms_private.push_jobs add column cancelled_at timestamptz;
create table qms_private.queue_edits (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.queue_entries(id),
  actor_id uuid not null references auth.users(id),
  request_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  from_status text not null check(from_status in ('called','seated','no-show')),
  to_status text not null default 'waiting' check(to_status='waiting'),
  reason text not null check(reason in ('late-arrival','staff-error','operational')),
  note text not null default '' check(char_length(note)<=200),
  previous_call jsonb not null,
  edit_number integer not null check(edit_number>0),
  unique(ticket_id,edit_number)
);
create index queue_edits_ticket_time on qms_private.queue_edits(ticket_id,created_at desc);
alter table qms_private.queue_edits enable row level security;
revoke all on qms_private.queue_edits from public,anon,authenticated;

create function public.restore_queue(p_id uuid,p_expected_status text,p_expected_edit_count integer,
  p_reason text,p_note text,p_request_id uuid) returns public.queue_entries
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries; prior qms_private.queue_edits; owner uuid; note_text text:=btrim(coalesce(p_note,''));
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  if p_request_id is null or p_id is null or p_reason is null or p_reason not in ('late-arrival','staff-error','operational')
    or p_expected_status is null or p_expected_status not in ('called','seated','no-show')
    or p_expected_edit_count is null or p_expected_edit_count<0 or char_length(note_text)>200 then
    raise exception 'Data pemulihan tidak valid. Pilih alasan dan periksa kembali tiket.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,7));
  select * into prior from qms_private.queue_edits where request_id=p_request_id;
  if found then
    if prior.ticket_id<>p_id or prior.actor_id<>auth.uid() or prior.reason<>p_reason or prior.note<>note_text
      or prior.from_status<>p_expected_status or prior.edit_number<>p_expected_edit_count+1 then
      raise exception 'Identitas permintaan tidak valid.';
    end if;
    select * into r from public.queue_entries where id=p_id;
    if r.service_date<>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tiket hanya dapat dipulihkan pada hari pendaftaran.'; end if;
    return r;
  end if;
  select owner_id into owner from public.queue_entries where id=p_id;
  if owner is null then raise exception 'Tiket tidak ditemukan.'; end if;
  -- Same owner lock as registration: a guest cannot gain two active tickets.
  perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
  -- Same lock order as push acknowledgements: serialize before changing the row.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
  select * into r from public.queue_entries where id=p_id for update;
  if r.service_date<>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tiket hanya dapat dipulihkan pada hari pendaftaran.'; end if;
  if r.status<>p_expected_status or r.edit_count<>p_expected_edit_count then
    raise exception 'Status tiket sudah berubah. Muat ulang daftar sebelum mencoba lagi.';
  end if;
  if p_reason='late-arrival' and r.status<>'no-show' then raise exception 'Alasan datang terlambat hanya berlaku untuk antrean yang dilewati.'; end if;
  if not exists(select 1 from public.staff_members where user_id=r.owner_id)
    and exists(select 1 from public.queue_entries where owner_id=r.owner_id and service_date=r.service_date
      and id<>r.id and status in ('waiting','called')) then
    raise exception 'Pelanggan ini sudah memiliki antrean aktif. Gunakan tiket yang masih aktif.';
  end if;
  insert into qms_private.queue_edits(ticket_id,actor_id,request_id,from_status,reason,note,previous_call,edit_number)
    values(r.id,auth.uid(),p_request_id,r.status,p_reason,note_text,
      jsonb_build_object('called_at',r.called_at,'last_call_at',r.last_call_at,'call_count',r.call_count,'push_status',r.push_status),r.edit_count+1);
  -- Invalidate pending work from the old cycle; retain records for audit.
  update qms_private.push_jobs set cancelled_at=clock_timestamp(),state='failed',attempts=3,lease_token=null
    where ticket_id=r.id and state in ('pending','sending','failed') and cancelled_at is null;
  update public.queue_entries set status='waiting',called_at=null,last_call_at=null,call_count=0,push_status=null,
    edit_count=edit_count+1,last_edited_at=clock_timestamp() where id=r.id returning * into r;
  return r;
end;
$$;
revoke all on function public.restore_queue(uuid,text,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.restore_queue(uuid,text,integer,text,text,uuid) to authenticated;

create function public.queue_edit_history(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'actor_id',actor_id,'created_at',created_at,
    'from_status',from_status,'to_status',to_status,'reason',reason,'note',note,'edit_number',edit_number)
    order by edit_number desc),'[]'::jsonb) from qms_private.queue_edits where ticket_id=p_id);
end;
$$;
revoke all on function public.queue_edit_history(uuid) from public,anon,authenticated;
grant execute on function public.queue_edit_history(uuid) to authenticated;
commit;
